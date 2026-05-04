/**
 * Service registration plugin.
 *
 * Instantiates all application services and decorates them onto
 * the Fastify instance so routes can access them via `fastify.xxx`.
 */

import fp from 'fastify-plugin'
import { AuthService } from '../services/auth.service.js'
import { UploadService } from '../services/upload.service.js'
import { StorageService } from '../services/storage.service.js'
import { WebhookService } from '../services/webhook.service.js'
import { RegistryService } from '../services/registry.service.js'
import { R2UploadBackend } from '../services/r2-upload-backend.js'
import { SchemaValidatorService } from '../services/schema-validator.service.js'

import type { Config } from '../types.js'
import type { FastifyInstance } from 'fastify'

declare module 'fastify' {
  interface FastifyInstance {
    /** Application configuration */
    config: Config
    /** Authentication and authorization */
    authService: AuthService
    /** Package upload operations */
    uploadService: UploadService
    /** Webhook delivery */
    webhookService: WebhookService
    /** Storage filesystem operations */
    storageService: StorageService
    /** Registry query operations */
    registryService: RegistryService
    /** JSON Schema validation */
    schemaValidatorService: SchemaValidatorService
  }
}

/**
 * Register all services onto the Fastify instance.
 *
 * @param app - Fastify instance
 * @param opts - Plugin options containing the configuration
 */
async function servicesPlugin(
  app: FastifyInstance,
  opts: { config: Config }
): Promise<void> {
  const { config } = opts

  // Decorate config
  app.decorate('config', config)

  // Layer 1: no dependencies
  const authService = new AuthService(config.authConfigPath)
  const storageService = new StorageService(config.storageRoot)
  const webhookService = new WebhookService(config.webhookConfigPath, app.log)
  const schemaValidatorService = new SchemaValidatorService(config.schemaDir)

  // Load async configurations
  await authService.load()
  await webhookService.load()

  // Layer 1.5: optional R2 backend
  const r2Backend =
    config.storageBackend === 'r2' && config.r2
      ? new R2UploadBackend(config.r2, app.log)
      : undefined

  if (r2Backend) {
    app.log.info('R2 upload backend enabled')
  }

  // Layer 2: depends on layer 1
  const registryService = new RegistryService(
    config.storageRoot,
    storageService
  )
  const uploadService = new UploadService(
    config.storageRoot,
    authService,
    storageService,
    schemaValidatorService,
    webhookService,
    app.log,
    r2Backend
  )

  // Decorate all services
  app.decorate('authService', authService)
  app.decorate('uploadService', uploadService)
  app.decorate('storageService', storageService)
  app.decorate('webhookService', webhookService)
  app.decorate('registryService', registryService)
  app.decorate('schemaValidatorService', schemaValidatorService)
}

export default fp(servicesPlugin, { name: 'services' })
