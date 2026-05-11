/**
 * File streaming utilities for HTTP responses.
 *
 * Provides efficient file serving with ETag, Content-Length,
 * Content-Type headers and HEAD request support.
 */

import mime from 'mime-types'
import { extname } from 'path'
import { stat } from 'fs/promises'
import { createReadStream } from 'fs'
import { NotFoundError, ForbiddenError } from './errors.js'

import type { FastifyReply, FastifyRequest, FastifyBaseLogger } from 'fastify'

/**
 * Get the MIME type for a file path.
 *
 * Overrides the standard library for `.ts` files which would otherwise
 * return `video/mp2t` instead of `text/typescript`.
 *
 * @param filePath - Absolute or relative file path
 * @returns MIME type string
 *
 * @example
 * getMimeType('index.ts')       // → 'text/typescript'
 * getMimeType('data.json')      // → 'application/json'
 * getMimeType('unknown.xyz')    // → 'application/octet-stream'
 */
export function getMimeType(filePath: string): string {
  if (extname(filePath) === '.ts') return 'text/typescript'

  return mime.lookup(filePath) || 'application/octet-stream'
}

/** Options for {@link streamFileResponse}. */
export interface StreamFileOptions {
  /** Absolute path to the file to serve */
  filePath: string

  /** Fastify reply object */
  reply: FastifyReply

  /** MIME type to set in Content-Type header */
  contentType: string

  /** Fastify request object */
  request: FastifyRequest

  /**
   * Optional `Cache-Control` header to set on the response. When omitted,
   * the value already on the reply (e.g. from a global plugin) is left
   * untouched. Pass one of the tiers from
   * `@rack/registry-core`'s `CACHE_HEADERS`.
   */
  cacheControl?: string

  /** Optional logger for error reporting */
  logger?: FastifyBaseLogger
}

/**
 * Stream a file as an HTTP response with proper headers.
 *
 * Uses `createReadStream` for efficient streaming of large files.
 * Sets Content-Type, Content-Length, and ETag headers.
 * Handles HEAD requests by returning headers only.
 *
 * @param options - File streaming options
 * @throws {NotFoundError} When the file does not exist
 * @throws {ForbiddenError} When the file is not readable
 *
 * @example
 * await streamFileResponse({
 *   request,
 *   reply,
 *   filePath: '/storage/@rack/node/1.0.0/registry.json',
 *   contentType: 'application/json'
 * })
 */
export async function streamFileResponse(
  options: StreamFileOptions
): Promise<void> {
  const { request, reply, filePath, contentType, cacheControl, logger } =
    options

  let fileStats: Awaited<ReturnType<typeof stat>>

  try {
    fileStats = await stat(filePath)
  } catch (error) {
    throwFsError(error, logger)
  }

  // Set response headers
  reply.type(contentType)
  reply.header('Content-Length', fileStats.size)
  if (cacheControl) reply.header('Cache-Control', cacheControl)

  const etag = `"${fileStats.mtime.getTime().toString(16)}-${fileStats.size.toString(16)}"`
  reply.header('ETag', etag)

  // HEAD — return headers only
  if (request.method === 'HEAD') {
    return reply.status(200).send()
  }

  // Stream the file
  const stream = createReadStream(filePath)
  return reply.status(200).send(stream)
}

/**
 * Map a filesystem error to the appropriate application error.
 *
 * @param error - Filesystem error
 * @param logger - Optional logger
 * @throws {NotFoundError} For ENOENT
 * @throws {ForbiddenError} For EACCES
 */
function throwFsError(error: unknown, logger?: FastifyBaseLogger): never {
  const code = (error as { code?: string }).code

  if (code === 'ENOENT') {
    throw new NotFoundError('NOT_FOUND', 'Resource not found')
  }

  if (code === 'EACCES') {
    throw new ForbiddenError('FORBIDDEN', 'Access denied to resource')
  }

  logger?.error(error, 'Failed to serve file')
  throw error
}
