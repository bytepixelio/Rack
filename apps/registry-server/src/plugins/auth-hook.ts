/**
 * Authentication hook plugin.
 *
 * Decorates requests with token extraction and namespace access
 * verification helpers. Token extraction lives in `@rack/auth-core` so
 * server and worker share the same header parsing.
 */

import fp from 'fastify-plugin'
import { extractToken } from '@rack/auth-core'

import type { AccessResult } from '@rack/auth-core'
import type { FastifyInstance, FastifyRequest } from 'fastify'

declare module 'fastify' {
  interface FastifyRequest {
    /** Cached auth token (undefined = not yet extracted). */
    authToken?: string | null
    /** Check whether the request carries the system-level admin token. */
    isAdminToken: () => boolean
    /** Extract the auth token from headers (result is cached per request). */
    getAuthToken: () => string | null
    /** Check whether the current token can access a namespace. */
    verifyNamespaceAccess: (namespace: string) => AccessResult
  }
}

/** Read the token value from a Fastify request via `@rack/auth-core`. */
function readToken(request: FastifyRequest): string | null {
  const authorization = request.headers.authorization
  const custom = request.headers['x-registry-token']
  return extractToken(
    typeof authorization === 'string' ? authorization : null,
    typeof custom === 'string' ? custom : null
  )
}

async function authHookPlugin(app: FastifyInstance): Promise<void> {
  // Lazy token extraction with per-request caching
  app.decorateRequest('getAuthToken', function () {
    if (this.authToken !== undefined) return this.authToken
    this.authToken = readToken(this)
    return this.authToken
  })

  // Delegate to AuthService for namespace-level verification
  app.decorateRequest('verifyNamespaceAccess', function (namespace: string) {
    return app.authService.verifyAccess(namespace, this.getAuthToken())
  })

  // Check if the request carries the system-level admin token
  app.decorateRequest('isAdminToken', function () {
    const { adminToken } = app.config
    if (!adminToken) return false
    return this.getAuthToken() === adminToken
  })
}

export default fp(authHookPlugin, {
  name: 'auth-hook',
  dependencies: ['services']
})
