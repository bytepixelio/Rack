/**
 * Registry Server entry point.
 *
 * Loads configuration, builds the Fastify application, starts listening,
 * and handles graceful shutdown on SIGTERM / SIGINT.
 *
 * Usage:
 * - Development: `pnpm dev`
 * - Production: `node dist/server.js`
 */

import { buildApp } from './app.js'
import { loadConfig } from './config.js'

import type { FastifyInstance } from 'fastify'

/**
 * Register graceful shutdown handlers for SIGTERM and SIGINT.
 *
 * On signal: stop the webhook queue, close the Fastify server
 * (drains in-flight requests), then exit.
 */
function registerShutdown(app: FastifyInstance): void {
  let shuttingDown = false

  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true

    app.log.info({ signal }, 'Shutdown signal received, closing server…')

    app.webhookService.shutdown()

    try {
      await app.close()
      app.log.info('Server closed gracefully')
      process.exit(0)
    } catch (err) {
      app.log.error({ err }, 'Error during shutdown')
      process.exit(1)
    }
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

/**
 * Start the Registry Server.
 *
 * @throws Process exits with code 1 if the server fails to start
 */
async function start(): Promise<void> {
  try {
    const config = loadConfig()
    const app = await buildApp(config)

    registerShutdown(app)

    app.log.info(
      {
        port: config.port,
        host: config.host,
        storageRoot: config.storageRoot,
        authConfigPath: config.authConfigPath
      },
      'Starting Registry Server with configuration'
    )

    await app.listen({ port: config.port, host: config.host })

    app.log.info(
      `Registry Server is listening on http://${config.host}:${config.port}`
    )
  } catch (err) {
    console.error('Failed to start server:', err)
    process.exit(1)
  }
}

start()
