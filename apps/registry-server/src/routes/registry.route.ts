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
import { CACHE_HEADERS, parseRegistryUrl } from '@rack/registry-core'
import { getMimeType, streamFileResponse } from '../lib/file-stream.js'
import { AppError, ValidationError, ForbiddenError } from '../lib/errors.js'

import type { RegistryService } from '../services/registry.service.js'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { RegistryLocator, RegistryResourceType } from '@rack/registry-core'

/** Wildcard route params. */
interface WildcardParams {
  '*': string
}

/** Resolved resource: filesystem path + MIME content type + Cache-Control. */
interface ResolvedResource {
  filePath: string | Promise<string>
  contentType: string
  cacheControl: string
}

/**
 * Resolve a parsed registry URL to a filesystem path, content type, and
 * `Cache-Control` tier (matching the worker's per-resource policy).
 *
 * @param type     - Resource type from URL parsing
 * @param locator  - Parsed locator
 * @param registry - RegistryService instance
 * @returns Resolved file path, content type, and cache header
 */
function resolveResource(
  type: RegistryResourceType,
  locator: RegistryLocator,
  registry: RegistryService
): ResolvedResource {
  switch (type) {
    case 'versions':
      return {
        filePath: registry.getVersionsPath(locator.namespace, locator.segments),
        contentType: 'application/json',
        cacheControl: CACHE_HEADERS.short
      }
    case 'versioned':
      return {
        filePath: registry.getVersionedPath(
          locator.namespace,
          locator.segments,
          locator.version!
        ),
        contentType: 'application/json',
        cacheControl: CACHE_HEADERS.immutable
      }
    case 'latest':
      return {
        filePath: registry.getLatestPath(locator.namespace, locator.segments),
        contentType: 'application/json',
        cacheControl: CACHE_HEADERS.short
      }
    case 'file':
      return {
        filePath: registry.getFilePath(
          locator.namespace,
          locator.segments,
          locator.version!,
          locator.filePath!
        ),
        contentType: getMimeType(locator.filePath!),
        cacheControl: CACHE_HEADERS.immutable
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

      const { type, locator } = parsed

      // Namespace whitelist check (driven by auth.json)
      if (!app.authService.isNamespaceAllowed(locator.namespace)) {
        throw new ForbiddenError('FORBIDDEN_NAMESPACE', 'Namespace not allowed')
      }

      // Auth check
      const authResult = request.verifyNamespaceAccess(locator.namespace)
      if (!authResult.allowed && authResult.error) {
        request.log.warn(
          { namespace: locator.namespace, reason: authResult.error.code },
          'Namespace access denied'
        )
        throw new AppError(
          authResult.error.code,
          authResult.error.message,
          authResult.error.statusCode
        )
      }

      // Resolve resource and stream response
      const { filePath, contentType, cacheControl } = resolveResource(
        type,
        locator,
        app.registryService
      )

      await streamFileResponse({
        reply,
        request,
        contentType,
        cacheControl,
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
