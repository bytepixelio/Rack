/**
 * Fastify application builder.
 *
 * Assembles all plugins and routes into a configured Fastify instance.
 * Receives configuration via parameter — no global state.
 */

import Fastify from 'fastify'
import compress from '@fastify/compress'
import multipart from '@fastify/multipart'
import { MAX_UPLOAD_SIZE, COMPRESSION_ENCODINGS } from './constants.js'

// Plugins
import metricsPlugin from './plugins/metrics.js'
import servicesPlugin from './plugins/services.js'
import authHookPlugin from './plugins/auth-hook.js'
import rateLimitPlugin from './plugins/rate-limit.js'
import errorHandlerPlugin from './plugins/error-handler.js'
import requestLoggerPlugin from './plugins/request-logger.js'

// Routes
import schemaRoute from './routes/schema.route.js'
import healthRoute from './routes/health.route.js'
import presetRoute from './routes/preset.route.js'
import uploadRoute from './routes/upload.route.js'
import registryRoute from './routes/registry.route.js'
import namespaceRoute from './routes/namespace.route.js'

import type { Config } from './types.js'
import type { FastifyInstance } from 'fastify'

/**
 * Get Pino logger configuration based on the environment.
 *
 * @param config - Application configuration
 * @returns Fastify-compatible logger options
 */
function getLoggerConfig(config: Config) {
  const base = { level: config.logLevel }

  if (config.nodeEnv === 'development') {
    return {
      ...base,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname',
          translateTime: 'HH:MM:ss Z'
        }
      }
    }
  }

  return base
}

/**
 * Build and configure the Fastify application.
 *
 * @param config - Server configuration (from {@link loadConfig})
 * @returns Configured Fastify instance ready to listen
 */
export async function buildApp(config: Config): Promise<FastifyInstance> {
  const app = Fastify({ logger: getLoggerConfig(config) })

  // ── Third-party plugins ──────────────────────────────────────────────

  await app.register(compress, {
    global: true,
    encodings: [...COMPRESSION_ENCODINGS]
  })

  await app.register(multipart, {
    limits: { fileSize: MAX_UPLOAD_SIZE }
  })

  // ── Application plugins ──────────────────────────────────────────────

  await app.register(servicesPlugin, { config })
  await app.register(errorHandlerPlugin)
  await app.register(authHookPlugin)
  await app.register(requestLoggerPlugin)
  await app.register(rateLimitPlugin)
  await app.register(metricsPlugin)

  // ── Routes ───────────────────────────────────────────────────────────

  await app.register(healthRoute)
  await app.register(schemaRoute)
  await app.register(presetRoute)
  await app.register(uploadRoute)
  await app.register(namespaceRoute)
  await app.register(registryRoute) // Wildcard — must be last

  return app
}
