/**
 * `rk config remove` command — remove registry configuration for a namespace.
 */

import chalk from 'chalk'
import { rackrc } from '../../rackrc.js'
import { Logger } from '../../infra/logger.js'
import { configRemoveHelpText } from './help.js'
import { Prompter } from '../../infra/prompts.js'
import { PRESETS_NAMESPACE, DEFAULT_NAMESPACE } from '../../../constants.js'
import {
  validateNamespace,
  checkRegistryExists,
  type ConfigRemoveOptions
} from './helpers.js'

import type { Command } from 'commander'

// ─── Command ───────────────────────────────────────────────────────────────

/**
 * Register the 'config remove' command.
 *
 * @param configCommand - Parent config command
 */
export function registerRemoveCommand(configCommand: Command): void {
  configCommand
    .command('remove')
    .alias('rm')
    .description('Remove registry configuration for a namespace')
    .argument('<namespace>', 'Registry namespace (e.g., @rack, @private)')
    .option('-f, --force', 'Skip confirmation prompt')
    .addHelpText('after', configRemoveHelpText)
    .action(
      async (
        namespace: string,
        options: ConfigRemoveOptions
      ): Promise<void> => {
        const logger = new Logger()
        const prompter = new Prompter()
        try {
          validateNamespace(namespace)

          if (
            namespace === DEFAULT_NAMESPACE ||
            namespace === PRESETS_NAMESPACE
          ) {
            throw new Error(`Cannot remove built-in namespace '${namespace}'`)
          }

          await checkRegistryExists(namespace)

          if (!options.force) {
            const confirmed = await prompter.confirm({
              message: `Remove registry '${chalk.bold(namespace)}'?`,
              initial: false
            })

            if (!confirmed) {
              logger.info(chalk.yellow('Operation cancelled'))
              return
            }
          }

          await rackrc.removeRegistry(namespace)

          logger.info(
            chalk.green(
              `✓ Registry ${chalk.bold(namespace)} removed successfully`
            )
          )
        } catch (error) {
          logger.commandError('Config remove', error)
          process.exit(1)
        }
      }
    )
}
