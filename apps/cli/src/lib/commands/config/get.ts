/**
 * `rk config get` command — display registry configuration for a namespace.
 */

import { rackrc } from '../../rackrc.js'
import { configGetHelpText } from './help.js'
import { Logger } from '../../infra/logger.js'
import {
  validateNamespace,
  checkRegistryExists,
  displayRegistryEntry,
  type ConfigGetOptions
} from './helpers.js'

import type { Command } from 'commander'

// ─── Command ───────────────────────────────────────────────────────────────

/**
 * Register the 'config get' command.
 *
 * @param configCommand - Parent config command
 */
export function registerGetCommand(configCommand: Command): void {
  configCommand
    .command('get')
    .description('Get registry configuration for a namespace')
    .argument('<namespace>', 'Registry namespace (e.g., @rack, @private)')
    .option('--json', 'Output in JSON format')
    .addHelpText('after', configGetHelpText)
    .action(
      async (namespace: string, options: ConfigGetOptions): Promise<void> => {
        const logger = new Logger()
        try {
          validateNamespace(namespace)

          const entry = await checkRegistryExists(namespace)
          const resolved = rackrc.resolveRegistry(entry)

          if (options.json) {
            console.log(JSON.stringify({ namespace, ...resolved }, null, 2))
          } else {
            displayRegistryEntry(namespace, resolved)
          }
        } catch (error) {
          logger.commandError('Config get', error)
          process.exit(1)
        }
      }
    )
}
