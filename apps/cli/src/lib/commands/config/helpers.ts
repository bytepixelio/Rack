/**
 * Shared types, validation, and display helpers for config commands.
 */

import chalk from 'chalk'
import { rackrc } from '../../rackrc.js'
import { Logger } from '../../infra/logger.js'

import type { RegistryEntry, ResolvedRegistry } from '../../rackrc.js'

// ─── Option Types ──────────────────────────────────────────────────────────

export interface ConfigSetOptions {
  url?: string
  token?: string
  header?: string[]
}

export interface ConfigGetOptions {
  json?: boolean
}

export interface ConfigListOptions {
  json?: boolean
}

export interface ConfigRemoveOptions {
  force?: boolean
}

// ─── Validation ────────────────────────────────────────────────────────────

/**
 * Validate that a namespace starts with `@`.
 *
 * @param namespace - Registry namespace to validate
 * @throws {Error} If the namespace does not start with `@`
 */
export function validateNamespace(namespace: string): void {
  if (!namespace.startsWith('@')) {
    throw new Error(
      `Invalid namespace format: ${namespace}. Must start with '@'`
    )
  }
}

/**
 * Load a registry entry by namespace, throwing if it does not exist.
 *
 * @param namespace - Registry namespace to look up
 * @returns The registry entry
 * @throws {Error} If the namespace is not configured
 */
export async function checkRegistryExists(
  namespace: string
): Promise<RegistryEntry> {
  const config = await rackrc.load()
  const entry = config.registries[namespace]

  if (!entry) {
    throw new Error(`Registry '${namespace}' not found`)
  }

  return entry
}

// ─── Display ───────────────────────────────────────────────────────────────

/**
 * Display a resolved registry entry.
 *
 * @param namespace - Registry namespace
 * @param resolved  - Resolved registry (url + headers)
 */
export function displayRegistryEntry(
  namespace: string,
  resolved: ResolvedRegistry
): void {
  const logger = new Logger()

  logger.info(
    chalk.bold.cyan(`Configuration for ${chalk.whiteBright(namespace)}:`)
  )
  logger.info(
    `  ${chalk.bold.cyan('URL:')}      ${chalk.whiteBright(resolved.url)}`
  )

  if (resolved.headers) {
    logger.info(`  ${chalk.bold.cyan('Headers:')}`)
    for (const [key, value] of Object.entries(resolved.headers)) {
      logger.info(`    ${chalk.bold(key)} -> ${chalk.whiteBright(value)}`)
    }
  }
}
