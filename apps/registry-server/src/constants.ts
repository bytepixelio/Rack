/**
 * Application constants.
 *
 * Values that are fixed at compile time and do not vary between deployments.
 * For deployment-specific configuration, see {@link config.ts}.
 */

// ─── Upload ──────────────────────────────────────────────────────────────────

/** Maximum upload file size in bytes (100 MB). */
export const MAX_UPLOAD_SIZE = 100 * 1024 * 1024

/** MIME types accepted for tar.gz package uploads. */
export const ALLOWED_UPLOAD_MIMETYPES = new Set([
  'application/gzip',
  'application/x-gzip',
  'application/x-tar',
  'application/x-compressed',
  'application/octet-stream'
])

// ─── Rate Limiting ───────────────────────────────────────────────────────────

/** Maximum number of requests per rate limit window. */
export const RATE_LIMIT_MAX = 1200

/** Rate limit time window. */
export const RATE_LIMIT_WINDOW = '1 minute'

// ─── Caching ─────────────────────────────────────────────────────────────────

/** Cache-Control max-age in seconds. */
export const CACHE_MAX_AGE = 60

/** Supported compression encodings. */
export const COMPRESSION_ENCODINGS = ['gzip', 'deflate', 'br'] as const

// ─── Webhook ─────────────────────────────────────────────────────────────────

/** Webhook delivery timeout in milliseconds (30 seconds). */
export const WEBHOOK_TIMEOUT_MS = 30_000

/** Maximum number of webhook delivery attempts. */
export const WEBHOOK_MAX_RETRIES = 4

/** Base delay in milliseconds for exponential backoff (1 second). */
export const WEBHOOK_BASE_DELAY_MS = 1000

/** User-Agent header sent with webhook deliveries. */
export const WEBHOOK_USER_AGENT = 'Rack-Registry-Webhook/1.0'

// ─── Prometheus Metrics ──────────────────────────────────────────────────────

/** Histogram buckets for HTTP request duration (in seconds, 1ms to 10s). */
export const HISTOGRAM_BUCKETS = [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10]

// ─── Schema ──────────────────────────────────────────────────────────────────

/** Allowed schema file names served by the /schemas endpoint. */
export const SCHEMA_WHITELIST = [
  'rack.json',
  'preset.json',
  'registry-item.json'
]

// ─── Logging ─────────────────────────────────────────────────────────────────

/** HTTP headers that should be redacted in request logs. */
export const SENSITIVE_HEADERS = [
  'authorization',
  'cookie',
  'set-cookie',
  'x-registry-token',
  'proxy-authorization'
]

// ─── Path Parsing ────────────────────────────────────────────────────────────

/** Regex pattern matching a SemVer version prefix (e.g. `1.0.0`, `2.3.1-beta`). */
export const SEMVER_PATTERN = /^\d+\.\d+\.\d+/

// ─── Upload Path Derivation ──────────────────────────────────────────────────

/**
 * Map a registry.json `type` to the storage segment that lives under
 * `<namespace>/`. Used at upload time to place a module under the same
 * category subdirectory the read path serves it from. Mirrors the
 * 6-category taxonomy documented in `apps/docs/{en,zh}/guide/registry.md`.
 *
 * To override the type-derived placement (e.g. for a registry whose
 * semantic role differs from its storage location), set an explicit
 * `path` field in registry.json.
 */
export const CATEGORY_BY_TYPE: Record<string, string> = {
  'registry:runtime': 'runtimes',
  'registry:framework': 'frameworks',
  'registry:build': 'build',
  'registry:feature': 'features',
  'registry:testing': 'testing',
  'registry:quality': 'quality'
}
