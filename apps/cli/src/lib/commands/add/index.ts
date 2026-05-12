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
import { AppError, VersionMismatchError } from '../../utils/errors.js'
import {
  isPreset,
  parseNamespace,
  canonicalizeIdentifier
} from '../../registry/identifier.js'
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
      'Registry identifier to add (e.g., @rack/quality/eslint)'
    )
    .addHelpText('after', addHelpText)
    .action(async (identifier: string) => {
      const logger = new Logger()
      const prompter = new Prompter()

      try {
        displayHeader(identifier, logger)

        // Reject malformed identifiers and presets BEFORE touching
        // disk — otherwise rackJson.readOrCreate would seed a stub
        // rack.json in a directory that is not a Rack project just
        // because the user typed `rk add @presets/foo` or a typo.
        // Throws InvalidNamespaceError on parse failure; surfaces with
        // a code+hint via commandError below.
        canonicalizeIdentifier(identifier)

        if (isPreset(identifier)) {
          throw new AppError(
            'INVALID_USAGE',
            `Preset is not supported in 'rk add'. Use 'rk init -t ${identifier}' or add individual registries.`
          )
        }

        const targetDir = process.cwd()
        const { items: installedRegistries = [], language } =
          await rackJson.readOrCreate(targetDir)

        const requestedKey = canonicalizeIdentifier(identifier)
        const existingMatch = installedRegistries.find(
          (r) => canonicalizeIdentifier(r) === requestedKey
        )
        if (existingMatch) {
          // Same canonical id but a different version is an upgrade
          // request — Rack does not support that, so refuse loudly
          // instead of silently keeping the old version (which is what
          // exit-0 "already installed" would imply to CI). Identical
          // versions (including both omitted) fall through to the
          // friendly skip path.
          const installedVersion = parseNamespace(existingMatch).version
          const requestedVersion = parseNamespace(identifier).version
          if (installedVersion !== requestedVersion) {
            throw new VersionMismatchError(existingMatch, identifier)
          }
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
