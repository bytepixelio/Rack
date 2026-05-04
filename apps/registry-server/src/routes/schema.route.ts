/**
 * Schema serving route.
 *
 * `GET /schemas/:file` — Serve JSON Schema files from an allow-list.
 */

import { NotFoundError } from '../lib/errors.js'
import { resolveSchemaPath } from '../lib/path.js'
import { SCHEMA_WHITELIST } from '../constants.js'
import { getMimeType, streamFileResponse } from '../lib/file-stream.js'

import type { FastifyInstance } from 'fastify'

/**
 * Register the schema serving route.
 *
 * @param app - Fastify instance
 */
export default async function schemaRoute(app: FastifyInstance): Promise<void> {
  app.route<{ Params: { file: string } }>({
    method: ['GET', 'HEAD'],
    url: '/schemas/:file',
    handler: async (request, reply) => {
      const { file } = request.params

      if (!SCHEMA_WHITELIST.includes(file)) {
        throw new NotFoundError('NOT_FOUND', 'Schema not found')
      }

      const filePath = resolveSchemaPath(app.config.schemaDir, file)

      await streamFileResponse({
        reply,
        request,
        filePath,
        logger: request.log,
        contentType: getMimeType(filePath)
      })
    }
  })
}
