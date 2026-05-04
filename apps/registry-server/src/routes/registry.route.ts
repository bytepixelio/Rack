/**
 * Registry resource routes.
 *
 * All routes under `/registries/@ns/...`:
 * - `GET /registries/@ns/:path+/versions`          — Version list
 * - `GET /registries/@ns/:path+`                   — Latest version
 * - `GET /registries/@ns/:path+/:version`           — Specific version
 * - `GET /registries/@ns/:path+/:version/files/*`   — Template file
 */

import fp from 'fastify-plugin'
import { parseRegistryUrl } from '../lib/path.js'
import { getMimeType, streamFileResponse } from '../lib/file-stream.js'
import { AppError, ValidationError, ForbiddenError } from '../lib/errors.js'

import type { ParsedRegistryPath } from '../types.js'
import type { RegistryResourceType } from '../lib/path.js'
import type { RegistryService } from '../services/registry.service.js'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

/** Wildcard route params. */
interface WildcardParams {
  '*': string
}

/** Resolved resource: filesystem path + MIME content type. */
interface ResolvedResource {
  filePath: string | Promise<string>
  contentType: string
}

/**
 * Resolve a parsed registry URL to a filesystem path and content type.
 *
 * @param type - Resource type from URL parsing
 * @param path - Parsed path components
 * @param registry - RegistryService instance
 * @returns Resolved file path and content type
 */
function resolveResource(
  type: RegistryResourceType,
  path: ParsedRegistryPath,
  registry: RegistryService
): ResolvedResource {
  switch (type) {
    case 'versions':
      return {
        filePath: registry.getVersionsPath(path.namespace, path.segments),
        contentType: 'application/json'
      }
    case 'versioned':
      return {
        filePath: registry.getVersionedPath(
          path.namespace,
          path.segments,
          path.version!
        ),
        contentType: 'application/json'
      }
    case 'latest':
      return {
        filePath: registry.getLatestPath(path.namespace, path.segments),
        contentType: 'application/json'
      }
    case 'file':
      return {
        filePath: registry.getFilePath(
          path.namespace,
          path.segments,
          path.version!,
          path.filePath!
        ),
        contentType: getMimeType(path.filePath!)
      }
  }
}

/**
 * Register registry resource routes.
 *
 * @param app - Fastify instance
 */
async function registryRoute(app: FastifyInstance): Promise<void> {
  app.route<{ Params: WildcardParams }>({
    method: ['GET', 'HEAD'],
    url: '/registries/*',
    handler: async (
      request: FastifyRequest<{ Params: WildcardParams }>,
      reply: FastifyReply
    ) => {
      const wildcardPath = request.params['*']
      const urlPath = `/${wildcardPath}`.replace(/\/{2,}/g, '/')

      const parsed = parseRegistryUrl(urlPath)
      if (!parsed) {
        throw new ValidationError(
          'INVALID_PATH',
          'Invalid registry resource path'
        )
      }

      const { type, path } = parsed

      // Namespace whitelist check (driven by auth.json)
      if (!app.authService.isNamespaceAllowed(path.namespace)) {
        throw new ForbiddenError('FORBIDDEN_NAMESPACE', 'Namespace not allowed')
      }

      // Auth check
      const authResult = request.verifyNamespaceAccess(path.namespace)
      if (!authResult.allowed && authResult.error) {
        request.log.warn(
          { namespace: path.namespace, reason: authResult.error.code },
          'Namespace access denied'
        )
        throw new AppError(
          authResult.error.code,
          authResult.error.message,
          authResult.error.statusCode
        )
      }

      // Resolve resource and stream response
      const { filePath, contentType } = resolveResource(
        type,
        path,
        app.registryService
      )

      await streamFileResponse({
        reply,
        request,
        contentType,
        logger: request.log,
        filePath: await filePath
      })
    }
  })
}

export default fp(registryRoute, {
  name: 'registry-route',
  dependencies: ['services', 'auth-hook']
})
