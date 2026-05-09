/**
 * `rk add` command — add a registry to an existing project.
 *
 * Reads rack.json, checks for duplicates, runs the pipeline,
 * and updates rack.json with the new registry. All display
 * logic lives in {@link ./display.ts}.
 */

import { Command } from 'commander'
import { addHelpText } from './help.js'
import { addRegistry } from './pipeline.js'
import { rackJson } from '../../rack-json.js'
import { Logger } from '../../infra/logger.js'
import { Prompter } from '../../infra/prompts.js'
import { parseNamespace } from '../../registry/identifier.js'
import {
  displayHeader,
  displayResults,
  displayAlreadyInstalled
} from './display.js'

/**
 * Register the add command with Commander.js.
 *
 * @param program - Commander program instance
 */
export function registerAddCommand(program: Command): void {
  program
    .command('add')
    .description('Add a registry to the project')
    .argument(
      '<registry>',
      'Registry identifier to add (e.g., @rack/tailwindcss)'
    )
    .addHelpText('after', addHelpText)
    .action(async (identifier: string) => {
      const logger = new Logger()
      const prompter = new Prompter()

      try {
        displayHeader(identifier, logger)

        const targetDir = process.cwd()
        const { items: installedRegistries = [], language } =
          await rackJson.readOrCreate(targetDir)

        const canonicalize = (id: string) => {
          const { namespace, path } = parseNamespace(id)
          return `${namespace}/${path}`
        }

        const requestedKey = canonicalize(identifier)
        const existingMatch = installedRegistries.find(
          (r) => canonicalize(r) === requestedKey
        )
        if (existingMatch) {
          displayAlreadyInstalled(identifier, existingMatch, logger)
          return
        }

        const result = await prompter.withSpinner(
          logger,
          'Running pipeline...',
          () =>
            addRegistry(
              { language, targetDir, identifier, installedRegistries },
              logger
            )
        )

        await rackJson.update(targetDir, result.appliedRegistries)

        displayResults(result, logger)
      } catch (error) {
        logger.commandError('Add', error)
        process.exit(1)
      }
    })
}
