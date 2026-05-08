/**
 * Preset serving route.
 *
 * `GET /presets/:name` — Serve preset.json configuration files.
 */

import { CACHE_HEADERS } from '@rack/registry-core'
import { resolvePresetPath } from '../lib/path.js'
import { streamFileResponse } from '../lib/file-stream.js'

import type { FastifyInstance } from 'fastify'

/**
 * Register the preset serving route.
 *
 * @param app - Fastify instance
 */
export default async function presetRoute(app: FastifyInstance): Promise<void> {
  app.route<{ Params: { name: string } }>({
    method: ['GET', 'HEAD'],
    url: '/presets/:name',
    handler: async (request, reply) => {
      const { name } = request.params
      const filePath = resolvePresetPath(app.config.storageRoot, name)

      await streamFileResponse({
        reply,
        request,
        filePath,
        logger: request.log,
        contentType: 'application/json',
        cacheControl: CACHE_HEADERS.long
      })
    }
  })
}
