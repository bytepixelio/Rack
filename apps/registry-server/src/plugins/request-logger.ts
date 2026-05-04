/**
 * Request logging plugin.
 *
 * Logs method, URL, and headers for every incoming request.
 * Sensitive headers (auth tokens, cookies) are replaced with
 * `[REDACTED]` unless the log level is debug or trace.
 */

import fp from 'fastify-plugin'
import { SENSITIVE_HEADERS } from '../constants.js'

import type { FastifyInstance } from 'fastify'

/** Set of log levels where headers should be shown in full. */
const VERBOSE_LEVELS = new Set(['debug', 'trace'])

async function requestLoggerPlugin(app: FastifyInstance): Promise<void> {
  const showFull = VERBOSE_LEVELS.has(app.log.level)

  app.addHook('onRequest', async (request) => {
    const headers = showFull
      ? request.headers
      : redactHeaders(
          request.headers as Record<string, string | string[] | undefined>
        )

    request.log.info(
      { url: request.url, method: request.method, headers },
      'Incoming request'
    )
  })
}

/**
 * Replace sensitive header values with `[REDACTED]`.
 *
 * @param headers - Raw request headers
 * @returns New object with sensitive values masked
 */
function redactHeaders(
  headers: Record<string, string | string[] | undefined>
): Record<string, string | string[] | undefined | '[REDACTED]'> {
  const result: Record<string, string | string[] | undefined | '[REDACTED]'> =
    {}

  for (const [key, value] of Object.entries(headers)) {
    result[key] = SENSITIVE_HEADERS.includes(key.toLowerCase())
      ? '[REDACTED]'
      : value
  }

  return result
}

export default fp(requestLoggerPlugin, { name: 'request-logger' })
