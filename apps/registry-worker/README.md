# Rack Registry Worker

Cloudflare Worker that serves the public read side of the Rack registry directly from R2. Mirrors a read-only subset of [`@rack/registry-server`](../registry-server/README.md)'s API so static assets can be delivered at the edge.

```text
┌─────────────────┐         ┌─────────────────────────┐     ┌────────┐     ╭──────────────────╮
│                 │         │                         │     │        │     │                  │
│      CLI rk     ├──reads─►│     Cloudflare edge     ├────►│ Worker ├──┬─►│ R2 rack-registry │
│                 │         │                         │     │        │  │  │                  │
│                 │         │                         │     │        │  │  │                  │
└─────────────────┘         └─────────────────────────┘     └────────┘  │  ╰──────────────────╯
                                                                        │
                                                                        │
                                         ┌──────────────────────────────┘
                                         │
                                         │
┌─────────────────┐         ┌────────────┴────────────┐
│                 │         │                         │
│ Maintainer / CI ├─uploads►│ registry-server Fastify │
│                 │         │                         │
└─────────────────┘         └─────────────────────────┘
```

Uploads go through the Fastify `registry-server` (which writes to the same R2 bucket via `STORAGE_BACKEND=r2`) — the `rk` CLI is read-only and never publishes; uploaders are CI pipelines or operators with `ADMIN_TOKEN`. The Worker only handles `GET` / `HEAD`; everything else returns `405`.

## Authentication

The Worker enforces the same namespace-token policy as the server, via the shared [`@rack/auth-core`](../../packages/auth-core) package. To operate it you only need to know:

- `config/auth.json` (repo-root) is the single source of truth. [`.github/workflows/sync-auth.yml`](../../.github/workflows/sync-auth.yml) pushes it to R2 at `.auth/auth.json` on every change. The workflow is parameterized by `secrets.R2_BUCKET_NAME` (defaults to `rack-registry`) and `vars.REGISTRY_PUBLIC_URL` (defaults to `https://registry.rackjs.com`) so fork / self-host deployments can target their own R2 + Worker without editing the file.
- Namespaces must be declared in `auth.json`; `[]` means anonymous, a non-empty token array requires a matching, non-expired token in `Authorization: Bearer …` or `X-Registry-Token: …`.
- An optional `ADMIN_TOKEN` Workers secret acts as a cross-namespace bypass — set it to the same value as the server's `ADMIN_TOKEN`.

For the full decision tree, cache behavior, and coupling guarantees with the server, see [ARCHITECTURE.md#auth-flow](./docs/ARCHITECTURE.md#auth-flow). The Worker caches `auth.json` for 10 minutes per isolate; the `sync-auth.yml` post-deploy `curl` check therefore only proves the Worker is reachable, **not** that the freshly uploaded config is already live. Local validation runs against `@rack/auth-core` before upload, so shape-level breaks fail in CI before they reach R2.

**Bootstrap warning:** before the first deploy with auth, ensure `.auth/auth.json` exists in R2 (trigger `Sync Auth Config` via Actions, or `wrangler r2 object put rack-registry/.auth/auth.json --file config/auth.json --content-type application/json --remote`). Without it, every `/registries/**` request returns 403.

## Quick start

```bash
# From repository root
pnpm install

pnpm --filter @rack/registry-worker dev      # wrangler dev
pnpm --filter @rack/registry-worker test
pnpm --filter @rack/registry-worker deploy   # wrangler deploy
```

## API endpoints

| Method     | Path                                    | R2 key                                           | Cache-Control                 |
| ---------- | --------------------------------------- | ------------------------------------------------ | ----------------------------- |
| `GET`      | `/health`                               | `.healthcheck` (HEAD)                            | `no-store`                    |
| `GET/HEAD` | `/namespaces`                           | list `/` delimited, filter `@*`                  | `max-age=60`                  |
| `GET/HEAD` | `/namespaces/:ns/registries`            | list `{ns}/` for `**/versions.json`              | `max-age=60`                  |
| `GET/HEAD` | `/schemas/:file`                        | `schema/{file}` (whitelist)                      | `max-age=86400`               |
| `GET/HEAD` | `/presets/:name`                        | `presets/{name}/preset.json`                     | `max-age=86400`               |
| `GET/HEAD` | `/registries/@ns/name/versions`         | `{ns}/{name}/versions.json`                      | `max-age=60`                  |
| `GET/HEAD` | `/registries/@ns/name`                  | read `versions.json` → `{version}/registry.json` | `max-age=60`                  |
| `GET/HEAD` | `/registries/@ns/name/:version`         | `{ns}/{name}/{version}/registry.json`            | `max-age=31536000, immutable` |
| `GET/HEAD` | `/registries/@ns/name/:version/files/*` | `{ns}/{name}/{version}/{filePath}`               | `max-age=31536000, immutable` |

Errors return `{ code, message }` JSON with `no-store`. Allowed schema files are whitelisted in `@rack/registry-core` (`rack.json`, `preset.json`, `registry-item.json`). Cache tiers are picked per route — see [ARCHITECTURE.md#cache-strategy](./docs/ARCHITECTURE.md#cache-strategy) for the rationale.

## Deployment

Configured in `wrangler.toml`:

- Route: `registry.rackjs.com` with `custom_domain = true` — the Worker owns this DNS record. An R2 public bucket cannot bind the same hostname at the same time.
- R2 binding: `BUCKET` → bucket `rack-registry`.
- `workers_dev = false`, `preview_urls = false` — no `*.workers.dev` exposure.

Cloudflare `Cache Rules` at the zone level are intentionally **not** used — the Worker owns cacheability through `Cache-Control` headers. If you add zone-level rules that override cache behavior, they will shadow the tier strategy above and may end up caching error responses.

### Required secrets

For `wrangler deploy` (local or CI):

| Secret                  | Where                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`  | `Account → Workers Scripts:Edit` + `Account → Workers R2 Storage:Edit` (the second is required by `sync-auth.yml`) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → account home                                                                                |

Optional Workers runtime secret (`wrangler secret put ADMIN_TOKEN`):

| Secret        | Purpose                                                                     |
| ------------- | --------------------------------------------------------------------------- |
| `ADMIN_TOKEN` | Matches a request token to bypass namespace auth. Same value as the server. |

CI deploys via `.github/workflows/deploy-worker.yml` on pushes touching `apps/registry-worker/**`. Auth config syncs via `.github/workflows/sync-auth.yml` on changes to `config/auth.json`.

## Project layout

```
src/
├── index.ts             # Router — dispatches by URL pathname
├── lib/
│   ├── auth.ts          # Loads .auth/auth.json from R2, delegates to @rack/auth-core
│   └── response.ts      # json / streamObject / mimeType / readJSON
└── routes/
    ├── health.ts
    ├── namespace.ts
    ├── preset.ts
    ├── schema.ts
    └── registry.ts
```

Protocol-level constants (cache tiers, SemVer pattern, schema whitelist) and URL parsing live in the shared [`@rack/registry-core`](../../packages/registry-core) package.

Tests mirror `src/` under `tests/`, with a shared `tests/helpers/mock-bucket.ts` fake of the `R2Bucket` API.
