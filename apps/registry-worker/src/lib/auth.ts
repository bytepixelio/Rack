/**
 * Worker-side namespace authentication.
 *
 * Loads auth.json from R2 (`.auth/auth.json`) with a module-scoped
 * in-memory cache, then delegates all verification to `@rack/auth-core`
 * so the decision logic stays in lockstep with the Fastify server.
 *
 * The R2 object is kept in sync with `config/auth.json` by the
 * `.github/workflows/sync-auth.yml` workflow.
 */

import {
  verifyAccess,
  extractToken,
  parseAuthConfig,
  isNamespaceAllowed
} from '@rack/auth-core'
import { json } from './response.js'

import type { AuthConfig } from '@rack/auth-core'

/** R2 key that mirrors repo `config/auth.json`. */
const AUTH_OBJECT_KEY = '.auth/auth.json'

/** In-memory cache TTL. Longer is cheaper; shorter propagates token revocation faster. */
const CACHE_TTL_MS = 600_000

interface CacheEntry {
  config: AuthConfig
  expiresAt: number
}

let cache: CacheEntry | null = null

/** Reset the in-memory auth cache. Exposed for tests. */
export function clearAuthCache(): void {
  cache = null
}

async function loadAuthConfig(
  bucket: R2Bucket,
  now: number
): Promise<AuthConfig> {
  if (cache && cache.expiresAt > now) return cache.config

  const obj = await bucket.get(AUTH_OBJECT_KEY)
  const raw = obj ? await obj.json<unknown>() : {}
  const config = parseAuthConfig(raw)

  cache = { config, expiresAt: now + CACHE_TTL_MS }
  return config
}

/**
 * Enforce namespace access for a request. Returns `null` when allowed,
 * or an error {@link Response} when the caller should abort the route.
 *
 * Decision flow:
 * 1. ADMIN_TOKEN matches → allowed (cross-namespace bypass)
 * 2. Namespace not declared in auth.json → 403 FORBIDDEN_NAMESPACE
 * 3. `verifyAccess` denies → 401 with its error code
 * 4. Otherwise → allowed
 *
 * @param bucket - R2 bucket that holds `.auth/auth.json`
 * @param adminToken - Optional system-level admin token (from Workers secret)
 * @param request - Incoming request; headers are read for token extraction
 * @param namespace - Target namespace (e.g. `@rack`)
 */
export async function enforceNamespaceAccess(
  bucket: R2Bucket,
  adminToken: string | undefined,
  request: Request,
  namespace: string
): Promise<Response | null> {
  const token = extractToken(
    request.headers.get('authorization'),
    request.headers.get('x-registry-token')
  )

  if (adminToken && token === adminToken) return null

  const config = await loadAuthConfig(bucket, Date.now())

  if (!isNamespaceAllowed(config, namespace)) {
    return json(
      { code: 'FORBIDDEN_NAMESPACE', message: 'Namespace not allowed' },
      403
    )
  }

  const result = verifyAccess(config, namespace, token)
  if (!result.allowed && result.error) {
    return json(
      { code: result.error.code, message: result.error.message },
      result.error.statusCode
    )
  }

  return null
}
