/**
 * `rk config list` command — list all configured registries.
 */

import { rackrc } from '../../rackrc.js'
import { configListHelpText } from './help.js'
import { Logger } from '../../infra/logger.js'
import { displayRegistryEntry, type ConfigListOptions } from './helpers.js'

import type { Command } from 'commander'

// ─── Command ───────────────────────────────────────────────────────────────

/**
 * Register the 'config list' command.
 *
 * @param configCommand - Parent config command
 */
export function registerListCommand(configCommand: Command): void {
  configCommand
    .command('list')
    .description('List all configured registries')
    .option('--json', 'Output in JSON format')
    .addHelpText('after', configListHelpText)
    .action(async (options: ConfigListOptions): Promise<void> => {
      const logger = new Logger()
      try {
        const resolved = await rackrc.listRegistries()

        if (options.json) {
          console.log(JSON.stringify(resolved, null, 2))
        } else {
          for (const [namespace, registry] of Object.entries(resolved)) {
            displayRegistryEntry(namespace, registry)
          }
        }
      } catch (error) {
        logger.commandError('Config list', error)
        process.exit(1)
      }
    })
}
