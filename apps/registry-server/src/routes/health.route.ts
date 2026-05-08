/**
 * Health check route.
 *
 * `GET /health` — Returns storage accessibility status
 * for load balancer and monitoring integrations.
 */

import { CACHE_HEADERS } from '@rack/registry-core'

import type { FastifyInstance } from 'fastify'

/**
 * Register the health check route.
 *
 * @param app - Fastify instance
 */
export default async function healthRoute(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request, reply) => {
    const result = await app.storageService.checkHealth()
    reply.header('Cache-Control', CACHE_HEADERS.none)

    if (result.accessible) {
      return reply.status(200).send({
        status: 'ok',
        checks: {
          storage: { status: 'ok' }
        }
      })
    }

    return reply.status(503).send({
      status: 'error',
      checks: {
        storage: { status: 'error', error: result.error }
      }
    })
  })
}
