/**
 * Display helpers for the `rk doctor` command.
 */

import chalk from 'chalk'
import { countBy, groupBy } from 'lodash-es'

import type { Logger } from '../../infra/logger.js'
import type { CheckLevel, CheckResult, CheckSummary } from './checks.js'

// ─── Constants ────────────────────────────────────────────────────────────

type ChalkFn = (text: string) => string

/** Icon and color for each check level. */
const LEVEL_STYLES: Record<CheckLevel, { icon: string; color: ChalkFn }> = {
  error: { icon: chalk.red('✗'), color: chalk.red },
  info: { icon: chalk.green('✓'), color: chalk.green },
  warning: { icon: chalk.yellow('⚠'), color: chalk.yellow }
}

/** Display label and color for each check category. */
const CATEGORY_STYLES: Record<
  CheckResult['category'],
  { label: string; color: ChalkFn }
> = {
  environment: { label: 'Environment', color: chalk.cyan },
  project: { label: 'Project', color: chalk.blue },
  remote: { label: 'Remote', color: chalk.magenta }
}

/** Ordered list of categories for display. */
const CATEGORIES: CheckResult['category'][] = [
  'environment',
  'project',
  'remote'
]

// ─── Display ─────────────────────────────────────────────────────────────

/**
 * Print the full check report grouped by category.
 *
 * @param summary - Check summary from {@link runChecks}
 * @param logger  - Logger instance for output
 */
export function displayReport(summary: CheckSummary, logger: Logger): void {
  const grouped = groupBy(summary.results, 'category')

  logger.info('')

  for (const category of CATEGORIES) {
    const items = grouped[category]
    if (!items?.length) continue

    const { label, color } = CATEGORY_STYLES[category]
    logger.info(chalk.bold(color(label)))

    for (const result of items) {
      const { icon, color: levelColor } = LEVEL_STYLES[result.level]
      const levelLabel = levelColor(result.level.toUpperCase())

      logger.info(
        `  ${icon} ${chalk.whiteBright('[')}${levelLabel}${chalk.whiteBright(']')} ${result.message}`
      )

      if (result.suggestion) {
        logger.info(
          `    ${chalk.cyan('→')} ${chalk.whiteBright(result.suggestion)}`
        )
      }
    }

    logger.info('')
  }

  displayCounts(summary.results, logger)
}

// ─── Internal ────────────────────────────────────────────────────────────

function displayCounts(results: CheckResult[], logger: Logger): void {
  const counts = countBy(results, 'level')
  const errors = counts.error ?? 0
  const warnings = counts.warning ?? 0

  if (errors > 0) {
    logger.info(
      chalk.red.bold(
        `✗ Found ${errors} error(s)${warnings > 0 ? `, ${warnings} warning(s)` : ''}`
      )
    )
  } else if (warnings > 0) {
    logger.info(chalk.yellow.bold(`⚠ Found ${warnings} warning(s)`))
  } else {
    logger.info(chalk.green.bold('✓ All checks passed'))
  }

  logger.info('')
}
