/**
 * Namespace discovery routes.
 *
 * `GET /namespaces`                        — List all namespaces
 * `GET /namespaces/:namespace/registries`  — List registries in a namespace
 */

import { CACHE_HEADERS } from '@rack/registry-core'
import { ValidationError, NotFoundError } from '../lib/errors.js'

import type { FastifyInstance } from 'fastify'

/**
 * Register namespace discovery routes.
 *
 * @param app - Fastify instance
 */
export default async function namespaceRoute(
  app: FastifyInstance
): Promise<void> {
  app.get('/namespaces', async (_request, reply) => {
    const namespaces = await app.storageService.findNamespaces()
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
