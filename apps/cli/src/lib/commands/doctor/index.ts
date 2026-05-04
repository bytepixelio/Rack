/**
 * `rk doctor` command — run checks on the environment,
 * project configuration, and remote registry connectivity.
 *
 * Results are grouped by category and displayed with colored
 * level indicators. Use `--json` for machine-readable output.
 */

import { Command } from 'commander'
import { runChecks } from './checks.js'
import { doctorHelpText } from './help.js'
import { displayReport } from './display.js'
import { Logger } from '../../infra/logger.js'
import { Prompter } from '../../infra/prompts.js'

// ─── Types ────────────────────────────────────────────────────────────────

interface DoctorCommandOptions {
  json?: boolean
}

// ─── Command ──────────────────────────────────────────────────────────────

/**
 * Register the 'doctor' command.
 *
 * @param program - Commander.js program instance
 */
export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Diagnose environment')
    .option('--json', 'Output checks as JSON', false)
    .addHelpText('after', doctorHelpText)
    .action(async (options: DoctorCommandOptions): Promise<void> => {
      const logger = new Logger()
      const prompter = new Prompter()

      try {
        const summary = await prompter.withSpinner(
          logger,
          'Running checks...',
          () => runChecks()
        )

        if (options.json) {
          console.log(JSON.stringify(summary, null, 2))
        } else {
          displayReport(summary, logger)
        }

        if (summary.hasErrors) {
          process.exit(1)
        }
      } catch (error) {
        logger.commandError('Doctor', error)
        process.exit(1)
      }
    })
}
