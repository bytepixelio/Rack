/**
 * Rate limiting plugin.
 *
 * Limits requests per client IP using @fastify/rate-limit.
 * Configuration values are compile-time constants.
 */

import fp from 'fastify-plugin'
import rateLimit from '@fastify/rate-limit'
import { RateLimitError } from '../lib/errors.js'
import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW } from '../constants.js'

import type { FastifyInstance } from 'fastify'

async function rateLimitPlugin(app: FastifyInstance): Promise<void> {
  await app.register(rateLimit, {
    hook: 'onRequest',
    max: RATE_LIMIT_MAX,
    timeWindow: RATE_LIMIT_WINDOW,
    keyGenerator: (request) => request.ip,
    errorResponseBuilder: (_req, context) => {
      throw new RateLimitError(
        `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)}s`
      )
    }
  })
}

export default fp(rateLimitPlugin, { name: 'rate-limit' })
