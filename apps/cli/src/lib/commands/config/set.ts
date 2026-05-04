/**
 * `rk config set` command — set registry configuration for a namespace.
 */

import chalk from 'chalk'
import { isString } from 'lodash-es'
import { rackrc } from '../../rackrc.js'
import { configSetHelpText } from './help.js'
import { Logger } from '../../infra/logger.js'
import {
  validateNamespace,
  displayRegistryEntry,
  type ConfigSetOptions
} from './helpers.js'

import type { Command } from 'commander'
import type { RegistryEntry } from '../../rackrc.js'

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Parse custom headers from command line arguments.
 *
 * Each header must be in `Key: Value` format. Entries without
 * a colon separator are skipped with a warning.
 *
 * @param headers - Raw header strings from `--header` option
 * @param logger  - Logger for invalid-format warnings
 * @returns Parsed key-value pairs
 *
 * @example
 * parseHeaders(['X-Api-Key: abc123', 'Accept: application/json'], logger)
 * // => { 'X-Api-Key': 'abc123', 'Accept': 'application/json' }
 */
function parseHeaders(
  headers: string[] | undefined,
  logger: Logger
): Record<string, string> {
  const parsed: Record<string, string> = {}

  if (!headers || headers.length === 0) {
    return parsed
  }

  for (const header of headers) {
    const separatorIndex = header.indexOf(':')
    if (separatorIndex === -1) {
      logger.warn(
        chalk.yellow(
          `⚠ Invalid header format: ${chalk.whiteBright(header)}. Expected "Key: Value"`
        )
      )
      continue
    }

    const key = header.slice(0, separatorIndex).trim()
    const value = header.slice(separatorIndex + 1).trim()

    if (key && value) {
      parsed[key] = value
    }
  }

  return parsed
}

/**
 * Build registry entry from existing entry and new options.
 *
 * Merges the existing URL, headers, and token with any new
 * values provided via CLI options.
 *
 * @param registryEntry - Current registry entry (string URL or object)
 * @param options       - CLI options (`--url`, `--token`)
 * @param parsedHeaders - Parsed `--header` key-value pairs
 * @returns Merged registry entry
 */
function buildRegistryEntry(
  registryEntry: RegistryEntry,
  options: ConfigSetOptions,
  parsedHeaders: Record<string, string>
): RegistryEntry {
  const existing = isString(registryEntry)
    ? { url: registryEntry, headers: {} }
    : registryEntry

  const token = options.token || existing.token

  return {
    url: options.url || existing.url,
    headers: { ...existing.headers, ...parsedHeaders },
    ...(token && { token })
  }
}

// ─── Command ───────────────────────────────────────────────────────────────

/**
 * Register the 'config set' command.
 *
 * @param configCommand - Parent config command
 */
export function registerSetCommand(configCommand: Command): void {
  configCommand
    .command('set')
    .description('Set registry configuration for a namespace')
    .argument('<namespace>', 'Registry namespace (e.g., @rack, @private)')
    .option('--url <url>', 'Registry URL')
    .option('--token <token>', 'Authentication token')
    .option('--header <header...>', 'Custom header in format "Key: Value"')
    .addHelpText('after', configSetHelpText)
    .action(
      async (namespace: string, options: ConfigSetOptions): Promise<void> => {
        const logger = new Logger()
        const { url, token, header } = options
        try {
          validateNamespace(namespace)

          if (!url && !token && !header) {
            throw new Error(
              'At least one of --url, --token, or --header must be provided'
            )
          }

          const config = await rackrc.load()
          const registryEntry = config.registries[namespace] ?? {
            url: '',
            headers: {}
          }

          const parsedHeaders = parseHeaders(header, logger)
          const entry = buildRegistryEntry(
            registryEntry,
            options,
            parsedHeaders
          )

          await rackrc.setRegistry(namespace, entry)

          logger.info(
            chalk.green(
              `✓ Registry ${chalk.bold(namespace)} configured successfully`
            )
          )
          displayRegistryEntry(namespace, rackrc.resolveRegistry(entry))
        } catch (error) {
          logger.commandError('Config set', error)
          process.exit(1)
        }
      }
    )
}
