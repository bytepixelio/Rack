/**
 * Protocol-level constants shared by the server and the worker.
 *
 * Anything that must agree byte-for-byte across both runtimes lives
 * here. Per-deployment configuration (storage roots, secrets, ports)
 * stays in each app's own config layer.
 */

// ─── Public API ──────────────────────────────────────────────────────

/** SemVer version pattern (e.g. `1.0.0`, `2.3.1-beta`, `1.0.0+build.42`). */
export const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

/**
 * Namespace pattern (e.g. `@rack`, `@my-org`). Mirrors
 * `packages/storage/schema/registry-item.json#namespace.pattern` so
 * any namespace accepted at upload time round-trips through the URL
 * parser, and traversal-style namespaces (`..`, `%40rack`) are
 * rejected before they reach storage.
 */
export const NAMESPACE_PATTERN = /^@[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/

/**
 * Single segment of a registry locator path (e.g. `quality`, `node`,
 * `tailwindcss`). Mirrors each `/`-separated segment of the schema's
 * `path` pattern; rejects `..`, uppercase, dots, and empty.
 */
export const PATH_SEGMENT_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Map a registry.json `type` to the storage segment under `<namespace>/`.
 * Mirrors the 6-category taxonomy in
 * `apps/docs/{en,zh}/guide/registry.md`.
 *
 * Override per-registry by setting an explicit `path` field in
 * registry.json (consumed by {@link deriveSegments}).
 */
export const CATEGORY_BY_TYPE: Record<string, string> = {
  'registry:build': 'build',
  'registry:testing': 'testing',
  'registry:quality': 'quality',
  'registry:feature': 'features',
  'registry:runtime': 'runtimes',
  'registry:framework': 'frameworks'
}

/** File names exposed by the public `/schemas/:file` endpoint. */
export const SCHEMA_FILES: ReadonlySet<string> = new Set([
  'rack.json',
  'preset.json',
  'registry-item.json'
])

/**
 * `Cache-Control` tiers chosen per route.
 *
 * Versioned content is content-addressed so it can cache forever;
 * listings (`versions.json`, namespace registries) must reflect new
 * uploads within ~60s; schemas/presets change rarely; errors must
 * never be cached so a transient 404 (mid-upload) cannot stick.
 */
export const CACHE_HEADERS = {
  none: 'no-store',
  short: 'public, max-age=60',
  long: 'public, max-age=86400',
  immutable: 'public, max-age=31536000, immutable'
} as const
