/**
 * Pure parser that turns raw auth.json data into a validated {@link AuthConfig}.
 */

import type { AuthConfig, TokenRecord, RawAuthConfig } from './types.js'

/** Parse a date value, returning undefined for invalid or empty values. */
function parseDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

/**
 * Parse and validate raw auth.json data.
 *
 * @param raw - Parsed JSON from auth.json (any shape)
 * @returns Validated, in-memory auth config
 * @throws {Error} When the top-level value is not a plain object
 *
 * @example
 * parseAuthConfig({ '@rack': [] })
 * // → every namespace '@rack' allowed, no tokens required
 *
 * parseAuthConfig({ '@priv': [{ token: 's', publish: true }] })
 * // → namespace '@priv' gated by token 's'
 */
export function parseAuthConfig(raw: unknown): AuthConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Auth config must be an object keyed by namespace')
  }

  const config = raw as RawAuthConfig
  const allowedNamespaces = new Set<string>()
  const tokens = new Map<string, Map<string, TokenRecord>>()

  for (const [namespace, rawTokens] of Object.entries(config)) {
    if (!Array.isArray(rawTokens)) {
      throw new Error(
        `Namespace "${namespace}" must map to an array of token entries`
      )
    }

    allowedNamespaces.add(namespace)

    if (rawTokens.length === 0) continue

    const tokenMap = new Map<string, TokenRecord>()

    for (const entry of rawTokens) {
      if (!entry || typeof entry !== 'object') continue
      if (typeof entry.token !== 'string' || !entry.token.trim()) continue

      const key = entry.token.trim()
      tokenMap.set(key, {
        token: key,
        publish: entry.publish === true,
        mark: typeof entry.mark === 'string' ? entry.mark : undefined,
        expiresAt: parseDate(entry.expiresAt)
      })
    }

    if (tokenMap.size === 0) {
      throw new Error(
        `Namespace "${namespace}" has token entries but none contain a valid "token" string`
      )
    }

    tokens.set(namespace, tokenMap)
  }

  return { tokens, allowedNamespaces }
}

/** Empty config — all namespaces forbidden, no tokens. */
export function emptyAuthConfig(): AuthConfig {
  return { tokens: new Map(), allowedNamespaces: new Set() }
}
