/**
 * Display helpers for the `rk init` command.
 *
 * All chalk/logger presentation logic for the init command lives here,
 * keeping the command entry point free of formatting concerns.
 */

import chalk from 'chalk'

import type { Logger } from '../../infra/logger.js'
import type { PipelineResult } from '../../pipeline/types.js'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProjectInfo {
  template: string
  targetDir: string
  projectName: string
}

export interface InitResult {
  warnings: string[]
  pipelineResult: PipelineResult
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Notify the user that init is running in CI (non-interactive) mode.
 *
 * @param logger - Logger instance
 */
export function displayCIMode(logger: Logger): void {
  logger.info(chalk.blue('Running in CI mode'))
}

/**
 * Print the project metadata header (project name, template, target dir).
 *
 * @param info - Project metadata
 * @param logger - Logger instance
 */
export function displayProjectInfo(info: ProjectInfo, logger: Logger): void {
  logger.info('')
  logger.info(`${chalk.blue('Project:')} ${chalk.green(info.projectName)}`)
  logger.info(`${chalk.blue('Template:')} ${chalk.green(info.template)}`)
  logger.info(
    `${chalk.blue('Target directory:')} ${chalk.green(info.targetDir)}`
  )
  logger.info('')
}

/**
 * Confirm that rack.json was created.
 *
 * @param logger - Logger instance
 */
export function displayManifestGenerated(logger: Logger): void {
  logger.info(chalk.green('✓ Generated rack.json'))
}

/**
 * Display the full init result: applied registries, file changes,
 * dependency summary, warnings, and farewell.
 *
 * @param result - Init service result
 * @param logger - Logger instance
 */
export function displayResults(result: InitResult, logger: Logger): void {
  const { pipelineResult, warnings } = result

  logger.info(chalk.green('✓ Initialization completed successfully!'))
  logger.info('')
  displayAppliedRegistries(pipelineResult, logger)
  displayFileChanges(pipelineResult, logger)
  displayDependencies(pipelineResult, logger)
  displayWarnings(warnings, logger)

  logger.info('')
  logger.info(chalk.green('Happy coding! 🎉'))
}

// ─── Internal ───────────────────────────────────────────────────────────────

/**
 * List the registries that were initially requested.
 *
 * @param result - Pipeline result
 * @param logger - Logger instance
 */
function displayAppliedRegistries(
  result: PipelineResult,
  logger: Logger
): void {
  const registries = result.initialRegistries
  logger.info(
    `${chalk.blue('Applied registries:')} ${chalk.green(registries.length)}`
  )
  for (const reg of registries) {
    logger.info(`  ${chalk.gray('•')} ${chalk.cyan(reg)}`)
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

/**
 * Print non-fatal warnings collected by the init pipeline.
 *
 * @param warnings - Warning messages
 * @param logger - Logger instance
 */
function displayWarnings(warnings: string[], logger: Logger): void {
  for (const w of warnings) {
    logger.warn(chalk.yellow(`⚠ ${w}`))
  }
}
