/**
 * Display helpers for the `rk add` command.
 *
 * All chalk/logger presentation logic for the add command lives here,
 * keeping the command entry point free of formatting concerns.
 */

import chalk from 'chalk'

import type { Logger } from '../../infra/logger.js'
import type { PipelineResult } from '../../pipeline/types.js'

/**
 * Print the add command header with the target registry name.
 *
 * @param registry - Registry identifier being added
 * @param logger - Logger instance
 */
export function displayHeader(registry: string, logger: Logger): void {
  logger.info('')
  logger.info(
    chalk.bold.cyan(`Adding registry: ${chalk.whiteBright(registry)}`)
  )
  logger.info('')
}

/**
 * Notify the user that the registry is already installed.
 *
 * Distinguishes "exact match" (same identifier) from "canonical match
 * with different version/language" — for the latter, surface the
 * existing entry and tell the user how to swap variants, since add
 * dedupes at the namespace/path level.
 *
 * @param requested - Identifier the user passed to `rk add`
 * @param existing  - Identifier already in `rack.json.items`
 * @param logger    - Logger instance
 */
export function displayAlreadyInstalled(
  requested: string,
  existing: string,
  logger: Logger
): void {
  if (existing === requested) {
    logger.info(
      chalk.yellow(
        `⚠ Registry already installed: ${chalk.whiteBright(requested)}`
      )
    )
    logger.info(chalk.gray('No changes made.'))
    return
  }

  logger.info(
    chalk.yellow(
      `⚠ Registry already installed with a different variant: ${chalk.whiteBright(existing)}`
    )
  )
  logger.info(
    chalk.gray(
      `You requested ${chalk.whiteBright(requested)}. ` +
        'rk add only allows one variant per registry — remove the existing ' +
        'entry from rack.json.items and rerun to switch.'
    )
  )
}

/**
 * Display the full pipeline result: applied registries, file changes,
 * and dependency summary.
 *
 * @param result - Pipeline result to display
 * @param logger - Logger instance
 */
export function displayResults(result: PipelineResult, logger: Logger): void {
  logger.info(chalk.green.bold('✓ Registry added successfully!'))
  logger.info('')
  displayAppliedRegistries(result, logger)
  displayFileChanges(result, logger)
  displayDependencies(result, logger)
}

// ─── Internal ───────────────────────────────────────────────────────────────

/**
 * List the registries that were applied (including resolved dependencies).
 *
 * @param result - Pipeline result
 * @param logger - Logger instance
 */
function displayAppliedRegistries(
  result: PipelineResult,
  logger: Logger
): void {
  logger.info(
    chalk.bold.cyan(
      `Applied ${chalk.whiteBright(result.appliedRegistries.length)} registries:`
    )
  )
  for (const reg of result.appliedRegistries) {
    logger.info(chalk.gray(`  - ${chalk.whiteBright(reg)}`))
  }
}

/**
 * Show a summary of created, modified, and skipped files.
 *
 * @param result - Pipeline result
 * @param logger - Logger instance
 */
function displayFileChanges(result: PipelineResult, logger: Logger): void {
  const counts = { created: 0, modified: 0, skipped: 0 }
  for (const c of result.fileChanges) counts[c.type]++

  if (counts.created === 0 && counts.modified === 0 && counts.skipped === 0) {
    return
  }

  logger.info('')
  logger.info(chalk.bold.cyan('File changes:'))

  if (counts.created > 0) {
    logger.info(
      chalk.green(`  Created: ${chalk.whiteBright(counts.created)} files`)
    )
  }
  if (counts.modified > 0) {
    logger.info(
      chalk.yellow(`  Modified: ${chalk.whiteBright(counts.modified)} files`)
    )
  }
  if (counts.skipped > 0) {
    logger.warn(
      chalk.yellow(`  Skipped: ${chalk.whiteBright(counts.skipped)} files`)
    )
  }
}

/**
 * Show a summary of production and dev dependencies added.
 *
 * @param result - Pipeline result
 * @param logger - Logger instance
 */
function displayDependencies(result: PipelineResult, logger: Logger): void {
  const depCount = Object.keys(result.dependencies).length
  const devDepCount = Object.keys(result.devDependencies).length

  if (depCount === 0 && devDepCount === 0) return

  logger.info('')
  logger.info(chalk.bold.cyan('Dependencies:'))

  if (depCount > 0) {
    logger.info(
      chalk.green(`  ${chalk.whiteBright(depCount)} production dependencies`)
    )
  }
  if (devDepCount > 0) {
    logger.info(
      chalk.blue(`  ${chalk.whiteBright(devDepCount)} dev dependencies`)
    )
  }
}
