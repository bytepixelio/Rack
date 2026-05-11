/**
 * Pure access verification against a parsed {@link AuthConfig}.
 *
 * Auth model:
 * - A namespace NOT declared in auth.json → forbidden (caller should 403)
 * - A namespace declared with empty token array → anonymous (open)
 * - A namespace declared with tokens → requires a matching, non-expired token
 */

import type { AuthConfig, AccessResult } from './types.js'

/**
 * Check whether a namespace is declared in the config.
 *
 * Callers must apply this as a hard whitelist before {@link verifyAccess}.
 *
 * @param config - Parsed auth config
 * @param namespace - Namespace to check (e.g. `@rack`)
 */
export function isNamespaceAllowed(
  config: AuthConfig,
  namespace: string
): boolean {
  return config.allowedNamespaces.has(namespace)
}

/**
 * Check whether a namespace allows anonymous (unauthenticated) access.
 *
 * @param config - Parsed auth config
 * @param namespace - Namespace to check (e.g. `@rack`)
 */
export function isNamespaceAnonymous(
  config: AuthConfig,
  namespace: string
): boolean {
  return !config.tokens.has(namespace)
}

/** Build a denied AccessResult. */
function denied(
  statusCode: number,
  code: string,
  message: string
): AccessResult {
  return {
    allowed: false,
    reason: 'unauthorized',
    error: { code, message, statusCode }
  }
}

/**
 * Verify whether a token grants access to a namespace.
 *
 * **Important:** Callers must check {@link isNamespaceAllowed} first.
 * This function only handles namespaces that ARE in the config.
 *
 * Decision flow:
 * 1. No tokens configured for namespace → allowed (anonymous)
 * 2. No token provided → denied (UNAUTHORIZED)
 * 3. Token not found → denied (INVALID_TOKEN)
 * 4. Token expired → denied (TOKEN_EXPIRED)
 * 5. Otherwise → allowed (authorized, returns token info)
 *
 * @param config - Parsed auth config
 * @param namespace - Namespace to verify (must be declared in the config)
 * @param tokenValue - Raw token string from the request, or `null`
 * @param now - Current time, defaults to `new Date()`. Pass for deterministic tests.
 */
export function verifyAccess(
  config: AuthConfig,
  namespace: string,
  tokenValue: string | null,
  now: Date = new Date()
): AccessResult {
  const namespaceTokens = config.tokens.get(namespace)

  if (!namespaceTokens) return { allowed: true, reason: 'anonymous' }

  if (!tokenValue) {
    return denied(401, 'UNAUTHORIZED', 'Authentication token is required')
  }

  const key = tokenValue.trim()
  const record = namespaceTokens.get(key)

  if (!record) return denied(401, 'INVALID_TOKEN', 'Provided token is invalid')

  if (record.expiresAt && record.expiresAt.getTime() < now.getTime()) {
    return denied(401, 'TOKEN_EXPIRED', 'Authentication token has expired')
  }

  return {
    allowed: true,
    reason: 'authorized',
    token: {
      namespace,
      token: key,
      mark: record.mark,
      publish: record.publish,
      expiresAt: record.expiresAt
    }
  }
}

/** Options for {@link filterAllowedNamespaces}. */
export interface FilterNamespacesOptions {
  /** Bypass per-namespace filtering and return every input as-is. */
  isAdmin?: boolean
}

/**
 * Reduce a list of namespaces to the ones a token may see.
 *
 * Used by both the Server's `GET /namespaces` route and the Worker's
 * equivalent — keep them in lockstep so the visible namespace set never
 * diverges between runtimes for the same token.
 *
 * Decision per namespace (in order):
 * 1. `options.isAdmin` → keep (no further checks)
 * 2. Not in `config.allowedNamespaces` → drop
 * 3. Anonymous-allowed namespace → keep
 * 4. Otherwise → keep iff {@link verifyAccess} allows the token
 *
 * @param config - Parsed auth config
 * @param namespaces - Candidate namespaces (e.g. from storage listing)
 * @param token - Raw token string from the request, or `null`
 * @param options - Filter options (admin bypass)
 * @returns Namespaces the token may discover, in the input order
 *
 * @example
 * filterAllowedNamespaces(config, ['@rack', '@priv'], 'secret')
 * // → ['@rack', '@priv'] if both are allowed for 'secret', else a subset
 */
export function filterAllowedNamespaces(
  config: AuthConfig,
  namespaces: string[],
  token: string | null,
  options: FilterNamespacesOptions = {}
): string[] {
  if (options.isAdmin) return [...namespaces]
  return namespaces.filter((ns) => {
    if (!isNamespaceAllowed(config, ns)) return false
    if (isNamespaceAnonymous(config, ns)) return true
    return verifyAccess(config, ns, token).allowed
  })
}
