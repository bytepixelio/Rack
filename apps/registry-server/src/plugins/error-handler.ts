/**
 * Global error handler plugin.
 *
 * Intercepts all unhandled errors and returns a consistent
 * `{ code, message }` JSON response. AppError subclasses carry
 * their own status code; everything else defaults to 500.
 */

import fp from 'fastify-plugin'
import { AppError } from '../lib/errors.js'
import { CACHE_HEADERS } from '@rack/registry-core'

import type { FastifyInstance } from 'fastify'

async function errorHandlerPlugin(app: FastifyInstance): Promise<void> {
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error)

    // Errors must never be cached — a transient 404 (mid-upload) shouldn't stick.
    reply.header('Cache-Control', CACHE_HEADERS.none)

    // Our typed business errors
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        code: error.code,
        message: error.message
      })
    }

    // Fastify built-in errors (validation, 404, etc.) or unexpected errors
    const e = error as { statusCode?: number; code?: string; message?: string }
    const statusCode = e.statusCode ?? 500
    const code = e.code ?? 'INTERNAL_SERVER_ERROR'

    return reply.status(statusCode).send({ code, message: e.message })
  })
}

export default fp(errorHandlerPlugin, { name: 'error-handler' })
