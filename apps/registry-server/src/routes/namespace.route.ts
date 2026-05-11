/**
 * Namespace discovery routes.
 *
 * `GET /namespaces`                        — List all namespaces
 * `GET /namespaces/:namespace/registries`  — List registries in a namespace
 *
 * Both routes are auth-aware: token-gated namespaces are hidden from
 * unauthenticated callers so that namespace names and registry lists
 * are not leaked to anyone who cannot access them.
 */

import { CACHE_HEADERS } from '@rack/registry-core'
import {
  AppError,
  NotFoundError,
  ForbiddenError,
  ValidationError
} from '../lib/errors.js'

import type { FastifyInstance } from 'fastify'

/**
 * Register namespace discovery routes.
 *
 * @param app - Fastify instance
 */
export default async function namespaceRoute(
  app: FastifyInstance
): Promise<void> {
  app.get('/namespaces', async (request, reply) => {
    const all = await app.storageService.findNamespaces()

    const namespaces = app.authService.filterNamespaces(
      all,
      request.getAuthToken(),
      { isAdmin: request.isAdminToken() }
    )

    reply.header('Cache-Control', CACHE_HEADERS.short)
    return reply.send({ namespaces })
  })

  app.get<{ Params: { namespace: string } }>(
    '/namespaces/:namespace/registries',
    async (request, reply) => {
      const { namespace } = request.params

      if (!namespace.startsWith('@')) {
        throw new ValidationError(
          'INVALID_NAMESPACE',
          'Namespace must start with @'
        )
      }

      // 1. Namespace whitelist check
      if (!app.authService.isNamespaceAllowed(namespace)) {
        throw new ForbiddenError('FORBIDDEN_NAMESPACE', 'Namespace not allowed')
      }

      // 2. Auth check (admin token is handled inside verifyNamespaceAccess)
      if (!request.isAdminToken()) {
        const authResult = request.verifyNamespaceAccess(namespace)
        if (!authResult.allowed && authResult.error) {
          throw new AppError(
            authResult.error.code,
            authResult.error.message,
            authResult.error.statusCode
          )
        }
      }

      // 3. List registries
      try {
        const registries = await app.storageService.findRegistries(namespace)
        reply.header('Cache-Control', CACHE_HEADERS.short)
        return reply.send({ namespace, registries })
      } catch (error) {
        const fsError = error as { code?: string }
        if (fsError.code === 'ENOENT') {
          throw new NotFoundError(
            'NAMESPACE_NOT_FOUND',
            `Namespace ${namespace} not found`
          )
        }
        throw error
      }
    }
  )
}
