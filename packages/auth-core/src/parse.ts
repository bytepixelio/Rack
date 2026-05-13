/**
 * Pure parser that turns raw auth.json data into a validated {@link AuthConfig}.
 *
 * Validation is **per-namespace fail-closed**: top-level shape errors
 * (auth.json itself is not a plain object) still throw, but a single
 * malformed namespace entry only excludes that namespace from
 * `allowedNamespaces` and records the reason in `config.errors`.
 *
 * This contains the blast radius — one typo in `expiresAt` rejects
 * exactly the affected namespace instead of failing every request
 * across the deployment. Callers should surface `config.errors` to
 * logs / monitoring so the broken namespace is still visible.
 */

import type {
  AuthConfig,
  TokenRecord,
  RawAuthConfig,
  AuthConfigError
} from './types.js'

/**
 * Namespace key pattern — mirrors `NAMESPACE_PATTERN` in
 * `@rack/registry-core` and `namespace.pattern` in
 * `packages/storage/schema/registry-item.json`.
 *
 * Kept inline here so this package stays dependency-free, but the
 * three source locations must agree byte-for-byte. If you change one,
 * change the others — Server discovery, Worker discovery, and the URL
 * parser all reject namespaces that fall outside this shape (§6.24),
 * so a parser that accepted laxer values would silently grow
 * "visible-but-not-installable" namespaces.
 */
const NAMESPACE_KEY_PATTERN = /^@[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/

/**
 * Parse an `expiresAt` value into a Date.
 *
 * Three states:
 *
 * - `undefined` / missing field / empty string → token never expires.
 * - Valid date string → that Date.
 * - Anything else → throws. Silently treating an invalid date as
 *   "never expires" is a security regression for publish tokens
 *   (a typo in `expiresAt` would extend the token's lifetime instead
 *   of failing closed).
 */
function parseExpiresAt(value: unknown, namespace: string): Date | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string' && !value.trim()) return undefined

  if (typeof value !== 'string') {
    throw new Error(
      `Namespace "${namespace}" has an invalid expiresAt: ` +
        'must be an ISO-8601 date string'
    )
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error(
      `Namespace "${namespace}" has an invalid expiresAt: ` +
        `"${value}" is not a valid date`
    )
  }
  return date
}

/**
 * Parse a single namespace's token array.
 *
 * @returns `null` for anonymous namespace (empty array), or the token map
 * @throws {Error} On any validation failure for this namespace
 */
function parseNamespaceTokens(
  namespace: string,
  rawTokens: unknown
): Map<string, TokenRecord> | null {
  if (!Array.isArray(rawTokens)) {
    throw new Error(
      `Namespace "${namespace}" must map to an array of token entries`
    )
  }

  if (rawTokens.length === 0) return null

  const tokenMap = new Map<string, TokenRecord>()

  for (const entry of rawTokens) {
    if (!entry || typeof entry !== 'object') continue
    if (typeof entry.token !== 'string' || !entry.token.trim()) continue

    const key = entry.token.trim()
    tokenMap.set(key, {
      token: key,
      publish: entry.publish === true,
      mark: typeof entry.mark === 'string' ? entry.mark : undefined,
      expiresAt: parseExpiresAt(entry.expiresAt, namespace)
    })
  }

  if (tokenMap.size === 0) {
    throw new Error(
      `Namespace "${namespace}" has token entries but none contain a valid "token" string`
    )
  }

  return tokenMap
}

/**
 * Parse and validate raw auth.json data.
 *
 * Per-namespace failures are isolated to `config.errors`; only top-level
 * shape errors throw. Surface `config.errors` to logs so silently-skipped
 * namespaces remain visible to operators.
 *
 * @param raw - Parsed JSON from auth.json (any shape)
 * @returns Validated auth config (`errors` may be non-empty)
 * @throws {Error} When the top-level value is not a plain object
 *
 * @example
 * parseAuthConfig({ '@rack': [] })
 * // → '@rack' allowed, no tokens required, errors: []
 *
 * parseAuthConfig({ '@priv': [{ token: 's', publish: true }], '@oops': 'bad' })
 * // → '@priv' gated by token 's'; '@oops' absent from allowedNamespaces;
 * //   errors: [{ namespace: '@oops', reason: '... must map to an array ...' }]
 */
export function parseAuthConfig(raw: unknown): AuthConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Auth config must be an object keyed by namespace')
  }

  const config = raw as RawAuthConfig
  const allowedNamespaces = new Set<string>()
  const tokens = new Map<string, Map<string, TokenRecord>>()
  const errors: AuthConfigError[] = []

  for (const [namespace, rawTokens] of Object.entries(config)) {
    // Reject malformed namespace keys (§6.24). Without this guard,
    // `@Rack` / `@bad.` / `@bad_` in `auth.json` end up in
    // `allowedNamespaces`, so Server discovery and Worker discovery
    // happily list them — but `parseRegistryUrl()` then rejects every
    // install attempt as `INVALID_PATH`, surfacing as a confusing
    // "visible but not installable" namespace. Treating the key as
    // a validation error matches what URL parsing already does.
    if (!NAMESPACE_KEY_PATTERN.test(namespace)) {
      errors.push({
        namespace,
        reason: `Namespace key "${namespace}" does not match the namespace pattern (${NAMESPACE_KEY_PATTERN.source})`
      })
      continue
    }
    try {
      const tokenMap = parseNamespaceTokens(namespace, rawTokens)
      allowedNamespaces.add(namespace)
      if (tokenMap) tokens.set(namespace, tokenMap)
    } catch (error) {
      errors.push({
        namespace,
        reason: error instanceof Error ? error.message : String(error)
      })
    }
  }

  return { errors, tokens, allowedNamespaces }
}

/** Empty config — all namespaces forbidden, no tokens, no errors. */
export function emptyAuthConfig(): AuthConfig {
  return { errors: [], tokens: new Map(), allowedNamespaces: new Set() }
}
