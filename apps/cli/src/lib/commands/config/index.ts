/**
 * `rk config` command — manage CLI configuration stored in ~/.rackrc.
 */

import { configHelpText } from './help.js'
import { registerSetCommand } from './set.js'
import { registerGetCommand } from './get.js'
import { registerListCommand } from './list.js'
import { registerRemoveCommand } from './remove.js'

import type { Command } from 'commander'

/**
 * Register the 'config' command and all its subcommands.
 *
 * @param program - Commander.js program instance
 */
export function registerConfigCommand(program: Command): void {
  const configCommand = program
    .command('config')
    .description('Manage CLI settings')
    .addHelpText('after', configHelpText)

  registerSetCommand(configCommand)
  registerGetCommand(configCommand)
  registerListCommand(configCommand)
  registerRemoveCommand(configCommand)
}
