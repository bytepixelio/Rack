/**
 * Configuration loader for the Registry Server.
 *
 * Reads environment variables and returns a typed {@link Config} object.
 * This is a pure function — no global singleton. The returned object is
 * passed into {@link buildApp} so all modules receive config via DI.
 */

import 'dotenv/config'
import { resolve } from 'path'

import type { Config } from './types.js'

/**
 * Parse a string into a valid TCP port number.
 *
 * @param value - Raw environment variable value
 * @param fallback - Default port when value is missing or invalid
 * @returns Valid port number between 1 and 65535
 */
function parsePort(value: string | undefined, fallback: number): number {
  if (!value) return fallback

  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed) || parsed <= 0 || parsed > 65535) return fallback

  return parsed
}

/**
 * Load server configuration from environment variables.
 *
 * @returns Fully resolved configuration object
 */
export function loadConfig(): Config {
  const {
    PORT,
    SCHEMA_DIR,
    ADMIN_TOKEN,
    STORAGE_ROOT,
    HOST = '0.0.0.0',
    AUTH_CONFIG_PATH,
    LOG_LEVEL = 'info',
    WEBHOOK_CONFIG_PATH,
    NODE_ENV = 'development',
    STORAGE_BACKEND = 'local',
    R2_BUCKET_NAME,
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY
  } = process.env

  const storageBackend = STORAGE_BACKEND === 'r2' ? 'r2' : 'local'

  const storageRoot =
    STORAGE_ROOT || resolve(process.cwd(), '../../packages/storage')

  const config: Config = {
    storageRoot,
    host: HOST,
    storageBackend,
    nodeEnv: NODE_ENV,
    logLevel: LOG_LEVEL,
    port: parsePort(PORT, 8080),
    schemaDir: SCHEMA_DIR || resolve(storageRoot, 'schema'),
    adminToken: ADMIN_TOKEN?.trim() || undefined,
    authConfigPath:
      AUTH_CONFIG_PATH || resolve(process.cwd(), '../../config/auth.json'),
    webhookConfigPath:
      WEBHOOK_CONFIG_PATH || resolve(process.cwd(), 'config/webhooks.json')
  }

  if (storageBackend === 'r2') {
    if (
      !R2_ACCOUNT_ID ||
      !R2_BUCKET_NAME ||
      !R2_ACCESS_KEY_ID ||
      !R2_SECRET_ACCESS_KEY
    ) {
      throw new Error(
        'R2 storage backend requires R2_BUCKET_NAME, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY'
      )
    }

    config.r2 = {
      accountId: R2_ACCOUNT_ID,
      bucketName: R2_BUCKET_NAME,
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY
    }
  }

  return config
}
