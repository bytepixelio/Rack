/**
 * Pure token extraction from request headers.
 *
 * Checks `Authorization: Bearer <token>` first (case-insensitive prefix),
 * then falls back to `X-Registry-Token`. The caller is responsible for
 * reading header values from their HTTP framework (Fastify `request.headers`
 * vs Fetch API `request.headers.get(...)`).
 */

/**
 * Extract an auth token from already-read header values.
 *
 * @param authorization - Value of the `Authorization` header, or nullish
 * @param xRegistryToken - Value of the `X-Registry-Token` header, or nullish
 * @returns Token string, or `null` if absent
 *
 * @example
 * extractToken('Bearer abc123', undefined)        // → 'abc123'
 * extractToken(null, 'xyz')                       // → 'xyz'
 * extractToken(undefined, undefined)              // → null
 */
export function extractToken(
  authorization: string | null | undefined,
  xRegistryToken: string | null | undefined
): string | null {
  if (typeof authorization === 'string') {
    const match = authorization.match(/^bearer\s+(.+)$/i)
    if (match) return match[1].trim()
  }

  if (typeof xRegistryToken === 'string' && xRegistryToken.trim()) {
    return xRegistryToken.trim()
  }

  return null
}
