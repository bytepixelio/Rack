/**
 * Rack CLI program definition.
 *
 * Assembles the Commander program with all registered commands.
 * Kept side-effect-free so tests can import without triggering execution.
 */

import { Command } from 'commander'
import { getCliVersion } from './lib/utils/version.js'
import { overviewHelpText } from './lib/help/overview.js'
import { registerAddCommand } from './lib/commands/add/index.js'
import { registerInitCommand } from './lib/commands/init/index.js'
import { registerListCommand } from './lib/commands/list/index.js'
import { registerDoctorCommand } from './lib/commands/doctor/index.js'
import { registerConfigCommand } from './lib/commands/config/index.js'
import { registerVersionCommand } from './lib/commands/version/index.js'

/**
 * Main CLI entry point.
 *
 * Creates the Commander program, registers all commands,
 * and parses `process.argv`.
 */
export async function main(): Promise<void> {
  const program = new Command()

  program
    .name('rk')
    .description('Rack - Modular project scaffolding tool')
    .version(await getCliVersion())
    .addHelpText('after', overviewHelpText)

  registerInitCommand(program)
  registerAddCommand(program)
  registerListCommand(program)
  registerDoctorCommand(program)
  registerConfigCommand(program)
  registerVersionCommand(program)

  await program.parseAsync(process.argv)
}
