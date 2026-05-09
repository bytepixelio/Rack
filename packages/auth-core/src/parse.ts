/**
 * Pure parser that turns raw auth.json data into a validated {@link AuthConfig}.
 */

import type { AuthConfig, TokenRecord, RawAuthConfig } from './types.js'

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
        expiresAt: parseExpiresAt(entry.expiresAt, namespace)
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
