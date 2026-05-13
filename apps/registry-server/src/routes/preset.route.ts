/**
 * Preset serving route.
 *
 * `GET /presets/:name` — Serve preset.json configuration files.
 */

import { ValidationError } from '../lib/errors.js'
import { resolvePresetPath } from '../lib/path.js'
import { streamFileResponse } from '../lib/file-stream.js'
import { CACHE_HEADERS, PATH_SEGMENT_PATTERN } from '@rack/registry-core'

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

      // Validate the preset name against the same kebab-case pattern
      // the schema enforces on upload (`packages/storage/schema/preset.json#name`).
      // Pre-§6.21 the route fed `name` straight into `resolvePresetPath`,
      // and an encoded traversal (`/presets/%2e%2e%2fsecret`) would
      // trip the `Path traversal detected` plain Error → 500 in the
      // global handler, while the Worker silently 404'd the same URL.
      // Reject malformed names up front so both runtimes answer 400
      // INVALID_PRESET with no chance of leaking the traversal into
      // the resolver layer.
      if (!PATH_SEGMENT_PATTERN.test(name)) {
        throw new ValidationError(
          'INVALID_PRESET',
          `Preset name must match ${PATH_SEGMENT_PATTERN.source}`
        )
      }

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
