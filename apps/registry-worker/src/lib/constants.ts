/** SemVer version prefix pattern (e.g. `1.0.0`, `2.3.1-beta`). */
export const SEMVER_RE = /^\d+\.\d+\.\d+/

/** Allowed schema file names served by the /schemas endpoint. */
export const SCHEMA_WHITELIST = new Set([
  'rack.json',
  'preset.json',
  'registry-item.json'
])

/**
 * Cache-Control presets, chosen per-route.
 *
 * Why split into tiers: versioned assets are content-addressed and can be
 * cached indefinitely, while listings (versions.json / namespaces) must
 * reflect new releases within a reasonable window. Errors must never be
 * cached — a transient 404 (upload in flight) should not stick.
 */
export const CACHE = {
  none: 'no-store',
  short: 'public, max-age=60',
  long: 'public, max-age=86400',
  immutable: 'public, max-age=31536000, immutable'
} as const
