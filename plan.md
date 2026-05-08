# Plan — `@rack/registry-core` extraction

## Background

The registry server (Fastify, Node) and the registry worker (Cloudflare
Worker, R2 backend) implement the **same public read protocol** —
identical URL scheme, identical key/path layout, identical `versions.json`
ordering convention. But the two codebases each carry their own
implementations of every primitive that defines that protocol:

| Concept                    | Server location                                                   | Worker location                                |
| -------------------------- | ----------------------------------------------------------------- | ---------------------------------------------- |
| `parseRegistryUrl`         | `apps/registry-server/src/lib/path.ts`                            | `apps/registry-worker/src/lib/parser.ts`       |
| Path/key building          | `lib/path.ts:resolveRegistryPath`, `resolveVersionsPath`, etc.    | inline in `routes/registry.ts`                 |
| `SEMVER_PATTERN`           | `apps/registry-server/src/constants.ts`                           | `apps/registry-worker/src/lib/constants.ts`    |
| `CATEGORY_BY_TYPE`         | `apps/registry-server/src/constants.ts` (added in #41)            | (not present — worker does not upload)         |
| Schema whitelist           | `apps/registry-server/src/constants.ts:SCHEMA_WHITELIST`          | `apps/registry-worker/src/lib/constants.ts:SCHEMA_WHITELIST` |
| Namespace registry listing | `apps/registry-server/src/services/storage.service.ts:findRegistries` (depth-1, broken) | `apps/registry-worker/src/routes/namespace.ts:handleNamespaceRegistries` (prefix scan, correct) |

The duplication is what let the recent upload bug ship: the upload code
on the server built R2 keys as `<namespace>/<name>/<version>` while the
read code (both server and worker) accepted multi-segment URLs. Because
the two paths used **different abstractions of "where this registry
lives"**, no single test could observe both sides at the same time, and
the asymmetry slipped past 100 % line coverage. A bug-by-bug pattern:

- `installToLocal` / `installToR2` derived path from `name` (fixed by
  PRs #40 / #41 by deriving from `type` or explicit `path`).
- `RegistryService.getRegistryDir(namespace, name)` still uses the
  `name`-only signature — currently dead code, but the footgun stays.
- `storage.service.findRegistries` walks one level deep — fails for
  every multi-segment registry currently in storage (`@rack/quality/*`,
  `@rack/build/*`, `@rack/runtimes/*`, `@rack/testing/*`). Not noticed
  in production because the worker's prefix-scan implementation runs
  there; only the local server is broken.
- Webhook payload `{namespace, name, version}` carries no segment
  information — receivers cannot reconstruct the canonical URL.
- Cache headers diverge — server sends a uniform 60s; worker tiers
  responses (`immutable` / `long` 86 400 / `short` 60 / `no-store`).

The deeper structural problem: **there is no canonical
"registry locator" type, and no single source for the routing /
key-building / parsing functions that consume it.** Each consumer
re-derives the locator semantics from scratch.

## Precedent

`@rack/auth-core` already does exactly this for namespace-token auth.
The server reads `auth.json` from disk, the worker reads it from R2,
both `parseAuthConfig` and `verifyAccess` from the shared package. Auth
has no drift because auth has no second copy. We replicate that pattern
for registry semantics.

## Goals

1. **Single source of truth** for URL parsing, key/path building, the
   type → category map, the SemVer pattern, and the schema whitelist.
2. **Listing parity** between server and worker: the same algorithm
   ("find every `versions.json` under `<namespace>/`, derive the
   relative prefix") backed by an interchangeable `RegistryStore`
   adapter — fs walk for the server, R2 prefix list for the worker.
3. **Round-trip integration coverage** — at least one test that calls
   `POST /registries`, then asserts the canonical read URL returns 200
   with the expected payload, then asserts the namespace listing
   includes the new registry. The kind of test that would have caught
   the upload-key bug before it reached `main`.
4. **Webhook payload carries the canonical path** so subscribers can
   distinguish `@rack/quality/foo` from `@rack/build/foo`.
5. **Aligned cache header tiers** — both backends serve the same
   `Cache-Control` for the same resource type.

## Non-goals

- **Changing the public read URL format.** The wire format stays.
- **Re-platforming the worker or the server.** Each keeps its current
  HTTP framework, streaming primitives, auth wiring, etc. Only the
  pure path-derivation logic moves.
- **Pulling worker R2 plumbing into the shared package.** R2 SDK,
  `bucket.list`, `bucket.get` calls all stay in the worker. The shared
  package is platform-agnostic and runs on Node, Workers, and Vitest
  alike.
- **Schema validation.** That's a separate axis (Ajv on Node only)
  and is out of scope for this extraction.
- **Reworking the upload pipeline shape.** Upload still lives entirely
  in the server; worker stays read-only. We just borrow the locator
  primitives the upload service constructs.

## Proposed package — `@rack/registry-core`

Path: `packages/registry-core/`. Same shape as `@rack/auth-core`
(`private`, `type: module`, `main` and `exports` pointing at
`./src/index.ts` for zero-build consumption from the workspace).

### Surface

```ts
// types.ts
export interface RegistryLocator {
  namespace: string         // '@rack'
  segments: string[]        // ['quality', 'husky']
  version?: string          // '1.0.0'
  filePath?: string         // 'templates/.husky/commit-msg'
}

export type RegistryResourceType = 'versions' | 'latest' | 'versioned' | 'file'

export interface ParsedRegistryUrl {
  type: RegistryResourceType
  locator: RegistryLocator
}

export interface RegistryManifestPathInput {
  name: string
  type?: string
  path?: string
}

// parser.ts — URL → locator
export function parseRegistryUrl(urlPath: string): ParsedRegistryUrl | null

// keys.ts — locator → key/path string (works for R2 keys *and* fs paths)
export function buildRegistryKey(loc: Required<Pick<RegistryLocator, 'namespace' | 'segments' | 'version'>>): string
export function buildVersionsKey(loc: Pick<RegistryLocator, 'namespace' | 'segments'>): string
export function buildFileKey(loc: Required<RegistryLocator>): string
export function buildRegistryDirKey(loc: Pick<RegistryLocator, 'namespace' | 'segments'>): string

// segments.ts — registry.json → segments
export function deriveSegments(input: RegistryManifestPathInput): string[]
//   path → splits and asserts last === name
//   else CATEGORY_BY_TYPE[type] → [category, name]
//   else [name]

// listing.ts — backend-agnostic listing algorithm
export interface RegistryStore {
  /** Stream every key (R2) or file path (fs) under a prefix, recursively. */
  walk(prefix: string): AsyncIterable<string>
}
export async function listRegistries(store: RegistryStore, namespace: string): Promise<string[]>
//   walks `<namespace>/`, finds everything matching `**/versions.json`,
//   returns the de-duped sorted list of registry-relative prefixes.

// constants.ts
export const SEMVER_PATTERN: RegExp
export const CATEGORY_BY_TYPE: Record<string, string>
export const SCHEMA_FILES: ReadonlySet<string>  // 'rack.json' | 'preset.json' | 'registry-item.json'
export const CACHE_HEADERS: {
  none: string        // 'no-store'
  short: string       // 'public, max-age=60'
  long: string        // 'public, max-age=86400'
  immutable: string   // 'public, max-age=31536000, immutable'
}
```

### Why this surface

- `RegistryLocator` is the **one type** that says "where this thing
  lives". Every read endpoint, every install path, every
  `versions.json` regen takes a locator. No more `(namespace, name,
  version)` tuples that pretend single-segment is the universe.
- `buildRegistryKey` returns a forward-slash string. The server joins
  it with `storageRoot` when it needs an absolute fs path; the worker
  passes it straight to `bucket.get`. **Same string both sides.**
- `RegistryStore` decouples the listing algorithm from the storage
  primitive. Server provides an fs adapter, worker provides an R2
  adapter, the algorithm itself lives in `@rack/registry-core`.
- `CACHE_HEADERS` is a string table — works in both Fastify (via
  `reply.header`) and Workers (via `Response` constructor).

### What does **not** move

- The `streamFileResponse` family in
  `apps/registry-server/src/lib/file-stream.ts` (fastify-specific
  streaming + ETag).
- The worker's `streamObject` / `readJSON` helpers (R2-specific).
- `RegistryService` (it stays as the server's thin wrapper, but its
  methods now construct locators and call the shared key builders).
- `R2UploadBackend` (R2 SDK glue, lives next to the upload service).
- Schema validation (Ajv loader).

## Phased migration

Each phase ends with `pnpm build / lint / test / test:e2e` green and
is mergeable on its own. Phases are sequential — later phases assume
earlier ones have landed.

### Phase 1 — Create the package, no consumers yet

- Add `packages/registry-core/` mirroring `@rack/auth-core`'s layout.
- Move the *pure* logic from
  `apps/registry-server/src/lib/path.ts:parseRegistryUrl`,
  `lib/path.ts:resolve*Path` (key-string variants), the relevant
  pieces of `constants.ts`, and the segment derivation logic from
  `upload.service.ts:parsePackageInfo`.
- Re-implement everything to take/return locators. Cover with unit
  tests in `packages/registry-core/tests/`.
- Server and worker still use their own implementations. Nothing else
  changes.

### Phase 2 — Server adopts `@rack/registry-core`

- `apps/registry-server/package.json` adds `"@rack/registry-core":
  "workspace:*"`.
- `lib/path.ts` is reduced to absolute-path resolvers (just
  `join(storageRoot, key)` + traversal guard). URL parsing, key
  building, and the constants come from the shared package.
- `services/upload.service.ts:parsePackageInfo` calls
  `deriveSegments` from the shared package.
- `services/registry.service.ts` rewrites its public methods to take
  locators (or accept `(namespace, segments, version)` and construct
  the locator internally — bikeshed during PR review).
  `getRegistryDir(namespace, name)` is **deleted** (currently dead
  code).
- `services/storage.service.ts:findRegistries` is **rewritten** to
  use the shared `listRegistries` algorithm with an `fsRegistryStore`
  adapter that walks `packages/storage` recursively. Existing tests
  for the depth-1 layout become tests for the new behavior; add cases
  for multi-segment fixtures (`@rack/quality/husky`,
  `@rack/runtimes/node`, etc.).
- `routes/registry.route.ts` switches to passing locators into the
  registry service.
- Cache-Control: server starts emitting tiered headers from the
  shared `CACHE_HEADERS` table, matching what the worker does. `versioned`
  → `immutable`, `versions`/`namespaces` → `short`, `presets`/`schemas`
  → `long`, errors → `none`.

### Phase 3 — Worker adopts `@rack/registry-core`

- `apps/registry-worker/package.json` adds the dependency.
- `lib/parser.ts` and the duplicated constants are deleted.
- `routes/registry.ts` and `routes/namespace.ts` switch to shared key
  builders and `listRegistries` (with an `r2RegistryStore` adapter
  wrapping `bucket.list`).
- Verify cache headers stay byte-identical to today (the shared
  `CACHE_HEADERS` should be defined to match the worker's current
  values, so this phase should be a no-op on the wire).

### Phase 4 — Webhook payload carries the path

- `WebhookService.emitEvent` accepts a locator (or a `path` string).
  Event payload becomes
  `{ namespace, name, version, path: '@rack/quality/husky/1.0.0' }`.
- This is a wire-format change for any external webhook consumer;
  document under the registry-server README's webhook section. Since
  the project is pre-launch, no migration window is needed.

### Phase 5 — Round-trip integration tests

- Add a new file `apps/e2e/tests/round-trip.test.ts` covering at
  least:
  1. `POST /registries` of a `registry:quality` fixture → 201.
  2. `GET /registries/@rack/quality/<name>/versions` → 200, body
     contains the new version.
  3. `GET /namespaces/@rack/registries` → contains
     `quality/<name>`.
  4. `GET /registries/@rack/quality/<name>/<version>` → 200,
     `name` field matches.
  5. `GET /registries/@rack/<name>` (the *wrong* URL) → 404.
- Run against both backends in CI: the server's existing in-process
  flow, plus the deploy-worker smoke job for R2.
- Future audit: any new endpoint must come with a round-trip test
  that exercises the same locator at write-time and at read-time.

### Phase 6 — Cleanup pass

- Search for the patterns this fix obsoletes:
  - `${namespace}/${name}/${version}` in any string template — should
    be a `buildRegistryKey` call.
  - `join(storageRoot, namespace, name, ...)` — should resolve via
    a key builder.
  - Any function still taking `name: string` where it should take
    `segments: string[]` or `locator: RegistryLocator`.
- Delete leftover types (`ParsedRegistryPath` in
  `apps/registry-server/src/types.ts`, etc.) once both consumers use
  `RegistryLocator`.
- `ConflictError` message in `upload.service.ts` switches from
  `${namespace}/${name}@${version}` to the canonical path string.

## Testing strategy

Three layers, in order of how much they would have caught the upload
bug:

1. **Unit (in `@rack/registry-core`).** Pure functions, easy and
   exhaustive: every URL form (single + multi segment), every type →
   category mapping, explicit-`path` override, `path`/name mismatch,
   listing-prefix algorithm with a stub `RegistryStore`. Same as today,
   but in one place.

2. **Adapter contract (per backend).** `RegistryStore` adapters get
   their own tests — fs adapter against a tmpdir with a fixture tree,
   R2 adapter against the existing `r2-upload-backend` mock. The
   contract is "given this prefix, yield these keys"; both adapters
   pass the same scenarios.

3. **Round-trip e2e.** Phase 5 above. The mandatory acceptance
   criterion: any registry uploaded must be reachable at its canonical
   URL and must appear in the listing. **This is the layer that 100 %
   line coverage cannot synthesize**, because it asserts the read
   path and the write path observe the same data.

## Risks / open questions

- **Listing performance on large namespaces.** Walking every file
  under `<namespace>/` is fine for the current scale. If `@rack/`
  ever has thousands of versions, the worker's prefix scan stays
  cheap (R2 paginates), but the server's recursive `readdir` could
  noticeably slow down `/namespaces/@rack/registries`. Acceptable for
  now — revisit if it becomes hot.
- **`RegistryService` shape.** Whether to keep the server's
  `RegistryService` as a wrapper, or fold its methods into
  `routes/registry.route.ts` directly, is a style call to make
  during Phase 2. Doesn't affect correctness.
- **Webhook payload break.** External consumers (if any exist by
  Phase 4) need to handle the new `path` field. We are pre-launch, so
  this is captured as a one-line README note rather than a versioning
  ceremony. If we go GA before Phase 4 ships, fold this into the
  v1.0 release notes instead.
- **Type churn.** Renaming `ParsedRegistryPath` → `RegistryLocator`
  (or keeping the old name as an alias) touches every file that
  imports it. Mechanical, but PR diffs will be loud.

## Out-of-scope follow-ups

- Schema-driven default `priority` (`registry:runtime` → 1, etc.) —
  the schema currently lets you set any non-negative integer. Could
  fold into the type taxonomy work but isn't load-bearing for the
  read/write asymmetry.
- A CLI command (`rk registry list`) that hits `/namespaces/:ns/
  registries`. Once that exists, `findRegistries` becomes
  user-visible and the broken depth-1 implementation would have
  surfaced through user reports.
- Schema validation moving into a shared package. The schema files
  themselves already live in `packages/storage/schema/`; the
  validator (Ajv) runs only on Node so the urgency is lower. Defer.
