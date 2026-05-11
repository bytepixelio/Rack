# Registry Worker architecture

## Why a separate Worker

The Fastify `registry-server` already speaks the full registry HTTP API. The Worker is **not** a re-implementation — it is a read-only edge mirror that exists for three reasons:

- **Latency** — registry reads (`/registries/...`, `/namespaces`, `/schemas`) happen on every `rk add`. Serving them from the nearest Cloudflare PoP avoids a round trip to whatever region hosts the Fastify origin.
- **Cost** — once content is uploaded, it is content-addressed and rarely changes. The Worker reads R2 directly and lets the edge cache do the heavy lifting; the origin server doesn't need to scale for read traffic.
- **Failure isolation** — read traffic can survive an origin outage as long as R2 is up. Uploads and webhook delivery still require the Fastify server, but a broken upload pipeline does not stop existing scaffolds from being installed.

The Worker therefore handles **only `GET` / `HEAD`**. Anything else returns `405`. Uploads, webhook delivery, rate limiting, schema validation — none of that lives here. See the topology diagram in the [README](../README.md) for how reads (Worker → R2) and uploads (Maintainer/CI → Fastify → R2) split across the same bucket.

## Layered architecture

```text
┌───────────────┐
│               │
│    Request    │
│               │
└───────┬───────┘
        │
        │
        │
        │
        ▼
┌───────────────┐
│               │
│    index.ts   │   ← URL match → handler dispatch
│               │
└───────┬───────┘
        │
        │
        │
        │
        ▼
┌───────────────┐
│               │
│  routes/*.ts  │   ← parse params, call lib helpers
│               │
└───────┬───────┘
        │
        │
        │
        │
        ▼
┌───────────────┐
│               │
│    lib/*.ts   │   ← auth, response (parser & constants from @rack/registry-core)
│               │
└───────┬───────┘
        │
        │
        │
        │
        ▼
┌───────────────┐
│               │
│ R2Bucket / KV │   ← Cloudflare bindings only
│               │
└───────────────┘
```

Three rules:

- **`index.ts` holds no business logic** — only URL pattern matching and handler dispatch
- **Routes call `lib/` helpers** — they don't reach into Cloudflare APIs directly except via `R2Bucket`
- **Auth lives in one place** — every gated route calls `enforceNamespaceAccess` from `lib/auth.ts`; never duplicate the decision logic

There are no Services or DI container — the Worker is small enough that a flat `routes/ + lib/` layout is clearer than a Fastify-style plugin tree.

## Request lifecycle

```text
┌──────────────────────────────────────────┐
│                                          │
│       Method != GET / HEAD -> 405        │
│                                          │
└─────────────────────┬────────────────────┘
                      │
                      │
                      │
                      │
                      ▼
┌──────────────────────────────────────────┐
│                                          │
│                                          │
│        Match pathname -> dispatch        │
│     /health, /presets/…, /schemas/…,     │
│ /namespaces, /namespaces/:ns/registries, │
│              /registries/…               │
│                                          │
└─────────────────────┬────────────────────┘
                      │
                      │
                      │
                      │
                      ▼
┌──────────────────────────────────────────┐
│                                          │
│  /registries/…:  enforceNamespaceAccess  │
│  /namespaces:    filter by token access  │
│  /namespaces/:ns/registries:             │
│                  enforceNamespaceAccess  │
│                                          │
└─────────────────────┬────────────────────┘
                      │
                      │
                      │
                      │
                      ▼
┌──────────────────────────────────────────┐
│                                          │
│                                          │
│   bucket.get(key) -> streamObject(...)   │
│     or bucket.list(...) -> json(...)     │
│                                          │
└──────────────────────────────────────────┘
```

Auth gating is applied to `/registries/*` and listing endpoints (`/namespaces`, `/namespaces/:ns/registries`). The listing endpoints filter out token-gated namespaces for unauthenticated callers so that namespace names and registry lists are not leaked — see the [namespace discovery docs](../../../apps/docs/en/guide/authentication.md#namespace-discovery). Asset endpoints (`/schemas/*`, `/presets/*`) remain anonymous. Health is unauthenticated by design.

## URL → R2 key mapping

`@rack/registry-core`'s `parseRegistryUrl` is the single place URL conventions are decoded. It returns one of four `RegistryResourceType` values; the route then maps each to an R2 key. The mapping is intentionally identical to `registry-server/src/lib/path.ts`.

| Type        | URL example                       | R2 key                                | Cache tier  |
| ----------- | --------------------------------- | ------------------------------------- | ----------- |
| `versions`  | `/@rack/foo/versions`             | `@rack/foo/versions.json`             | `short`     |
| `latest`    | `/@rack/foo`                      | `versions.json` → `{v}/registry.json` | `short`     |
| `versioned` | `/@rack/foo/1.0.0`                | `@rack/foo/1.0.0/registry.json`       | `immutable` |
| `file`      | `/@rack/foo/1.0.0/files/index.ts` | `@rack/foo/1.0.0/index.ts`            | `immutable` |

Parsing rules:

- The first segment must start with `@` — anything else is `null` (returns `400 INVALID_PATH`)
- A segment matching `SEMVER_PATTERN` (defined in `@rack/registry-core`) is treated as the version pivot
- Segments before the version pivot become the registry path; segments after `files/` become the file path
- A trailing `/versions` (with no version pivot) yields the version-list resource
- No version pivot at all → `latest` (the route reads `versions.json[0]` for the registry's HEAD)

Why a single parser instead of multiple regex per route: registry identifiers can contain arbitrarily nested segments (`@ns/group/sub/name@1.0.0/files/...`). Centralizing the version-pivot search avoids scattering the same logic across four route handlers.

## Auth flow

```text
┌──────────────────────────────────┐
│                                  │
│                                  │
│          Extract token           │
│ Authorization / X-Registry-Token │
│                                  │
└─────────────────┬────────────────┘
                  │
                  │
                  │
                  │
                  ▼
◇──────────────────────────────────◇
│                                  │
│       ADMIN_TOKEN matches?       ├──────────────────────┐
│                                  │                      │
◇─────────────────┬────────────────◇                     no
                  │                                       │
                 yes                                      │
                  │                                       │
                  │                                       │
                  ▼                                       ▼
┌──────────────────────────────────┐     ┌─────────────────────────────────┐
│                                  │     │                                 │
│                                  │     │                                 │
│              allow               │     │   Load .auth/auth.json from R2  │
│                                  │     │          (10-min cache)         │
│                                  │     │                                 │
└──────────────────────────────────┘     └────────────────┬────────────────┘
                                                          │
                                                          │
                                                          │
                                                          │
                                                          │
◇──────────────────────────────────◇                      │
│                                  │                      │
│       Namespace declared?        ├◄─────────────────────┤
│                                  │                      │
◇─────────────────┬────────────────◇                     yes
                  │                                       │
                 no                                       │
                  │                                       │
                  │                                       │
                  ▼                                       ▼
┌──────────────────────────────────┐     ┌─────────────────────────────────┐
│                                  │     │                                 │
│     403 FORBIDDEN_NAMESPACE      │  ┌──┤ verifyAccess(config, ns, token) │
│                                  │  │  │                                 │
└──────────────────────────────────┘  │  └────────────────┬────────────────┘
                                      │                   │
                                      │                allowed
               denied─────────────────┘                   │
                  │                                       │
                  ▼                                       ▼
┌──────────────────────────────────┐     ┌─────────────────────────────────┐
│                                  │     │                                 │
│         401 / 403 / 410          │     │             continue            │
│                                  │     │                                 │
└──────────────────────────────────┘     └─────────────────────────────────┘
```

Implementation lives in `lib/auth.ts`. Three points worth calling out:

**ADMIN_TOKEN bypass.** When set as a Workers secret, a request whose token equals `ADMIN_TOKEN` is allowed for any namespace, regardless of whether that namespace is declared in `auth.json`. Used for cross-namespace scripts (uploads, audits) and meant to share the same value as the Fastify server's `ADMIN_TOKEN`.

**In-memory cache.** `auth.json` is parsed once per Worker isolate and held for `CACHE_TTL_MS = 600_000` (10 minutes). This means token revocation propagates with up to a 10-minute lag. The cache is **module-scoped** — every cold-started isolate re-reads the R2 object, and `clearAuthCache()` exists only for tests.

**Delegation to `@rack/auth-core`.** Parsing (`parseAuthConfig`) and verification (`verifyAccess`, `isNamespaceAllowed`, `extractToken`) all live in the shared package. The Worker contributes only the R2 read and the cache layer — keeping the decision logic identical to the server is a hard requirement (see [Coupling points](#coupling-points)).

**Bootstrap caveat.** Until the first run of `sync-auth.yml` (or a manual `wrangler r2 object put`), R2 has no `.auth/auth.json` object. The Worker treats a missing file as an empty config, so every namespace-gated request returns `403 FORBIDDEN_NAMESPACE`. This is intentional — failing closed is safer than serving content with no policy.

## Cache strategy

Defined in `@rack/registry-core`'s `CACHE_HEADERS`. Each route picks one tier explicitly:

| Tier        | Value                                 | Used for                       | Why                                                                               |
| ----------- | ------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------- |
| `none`      | `no-store`                            | errors, `/health`              | A transient 404 (upload in flight) must not stick                                 |
| `short`     | `public, max-age=60`                  | listings, `latest`, `versions` | Must reflect new releases within ~1 minute                                        |
| `long`      | `public, max-age=86400`               | schemas, presets               | Change rarely but not content-addressed                                           |
| `immutable` | `public, max-age=31536000, immutable` | versioned files & registries   | URL is content-addressed: `@rack/foo/1.0.0/...` cannot change semantics over time |

Cloudflare zone-level Cache Rules are intentionally **not** used. Mixing them with these `Cache-Control` headers leads to non-obvious overrides, including the worst case of caching error responses.

## Storage layout in R2

The bucket `rack-registry` holds three top-level prefixes:

```
rack-registry/
├── .auth/
│   └── auth.json              # uploaded by sync-auth.yml; same shape as repo config/auth.json
├── .healthcheck               # 0-byte marker, written once on bucket setup
├── presets/
│   └── {name}/
│       └── preset.json
├── schema/
│   ├── rack.json
│   ├── preset.json
│   └── registry-item.json
└── @namespace/                # one prefix per namespace
    └── path/to/registry/
        ├── versions.json      # { "versions": ["1.2.3", "1.2.2", ...] }   (DESC)
        └── 1.2.3/
            ├── registry.json  # the registry manifest
            └── ...files...    # everything else uploaded for this version
```

Three invariants the Worker assumes (the server enforces them on upload):

- `versions.json` exists for every registry; the array is sorted by SemVer DESC; `versions[0]` is the current latest
- A `{version}/registry.json` exists for every version listed in `versions.json`
- File paths under `{version}/` are stored verbatim — `mimeType()` derives `Content-Type` from the extension; unknown extensions fall back to `application/octet-stream`

If those invariants break (e.g. a partial upload), reads return `404 NOT_FOUND`. The Worker does not attempt repair.

## Coupling points

Three things must stay in lockstep with `apps/registry-server`. Drift causes silent inconsistencies — the Worker would happily serve content the server would have rejected, or vice versa.

| Thing                          | Shared package / Worker file    | Server file                                |
| ------------------------------ | ------------------------------- | ------------------------------------------ |
| URL → resource type parsing    | `@rack/registry-core` parser    | `src/lib/path.ts`                          |
| URL → R2 key mapping           | `routes/registry.ts`            | `src/services/storage.service.ts`          |
| Auth model (parse + verify)    | `@rack/auth-core`               | `src/services/auth.service.ts` (delegates) |
| Schema whitelist               | `@rack/registry-core` constants | `src/routes/schema.route.ts`               |
| Cache tiers                    | `@rack/registry-core` constants | `@rack/registry-core` constants            |
| Allowed methods (`GET`/`HEAD`) | `index.ts` 405                  | server defaults                            |

`@rack/auth-core` and `@rack/registry-core` deliberately exist to make these couplings structural — neither side can drift unilaterally without breaking shared tests in the respective `packages/*/tests/` directories.

The remaining couplings (R2 key mapping, allowed methods) are by-convention. If you change one, change the other and update both test suites.

## Edge runtime constraints

Things you can't do here that you can do in the Fastify server:

- **No filesystem.** `fs/promises` is unavailable. R2 is the only storage primitive — even ephemeral temp dirs aren't an option mid-request.
- **No long-lived state.** Module-scoped variables persist within an isolate but isolates are recycled freely; treat them as opportunistic caches, never as authoritative state. `clearAuthCache()` is for tests, not production.
- **No streaming uploads.** The Worker's request body API supports streaming but R2 binding writes need full bodies — uploads stay on the server side.
- **No `process.env`.** Secrets and bindings come through the `Env` argument to `fetch()`. `wrangler.toml` declares `[[r2_buckets]]` for `BUCKET`; `ADMIN_TOKEN` is set via `wrangler secret put`.
- **CPU & memory budgets.** Workers have a per-request CPU limit (50 ms on free, ~30 s on paid). `parseRegistryUrl` is O(URL segments), and `bucket.list` calls are paginated by Cloudflare — neither is a concern in practice, but loops over large `bucket.list` results would be.

## Testing approach

Tests mirror `src/` exactly under `tests/`. The shared `tests/helpers/mock-bucket.ts` is a hand-rolled `R2Bucket` fake that supports `get` / `put` / `head` / `list` with prefix and delimiter semantics matching the real binding. Two reasons it's hand-rolled:

- The real `R2Bucket` is a host-bound object; `@miniflare`/`workerd` testing harnesses pull in heavy dependencies relative to what these tests need
- The fake makes it trivial to seed deterministic state per-test (`bucket.put('@rack/foo/versions.json', ...)`) without spinning up a Worker runtime

Auth tests in `tests/lib/auth.test.ts` exercise the full decision tree: missing config, anonymous namespace, valid token, expired token, ADMIN_TOKEN bypass, cache TTL behavior. Anything that depends on the auth-core parsing rules is unit-tested in `packages/auth-core/tests/` — duplicating those assertions here would just track upstream changes.

## What's intentionally not here

- **Rate limiting.** Cloudflare's WAF/rate-limiting rules cover this at the zone level. Doing it in the Worker would double-count and waste CPU budget.
- **Metrics.** Workers Analytics Engine and the Cloudflare dashboard already expose request counts, status codes, and CPU time. A Prometheus endpoint here would have nothing to add.
- **Webhook delivery.** Webhooks are an upload-side concern — they live in the Fastify server's `WebhookService`.
- **Schema validation.** Reads serve already-validated artifacts; the server validates on upload. Re-validating here would just slow reads down.
