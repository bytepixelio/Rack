/**
 * Display helpers for the `rk list` command.
 *
 * All presentation logic lives here, keeping the command entry
 * point free of formatting concerns.
 */

import chalk from 'chalk'

import type { Logger } from '../../infra/logger.js'

/**
 * Print a list of namespaces.
 *
 * @param namespaces - Namespace strings as returned by the registry
 * @param logger     - Logger for output
 */
export function displayNamespaces(namespaces: string[], logger: Logger): void {
  if (namespaces.length === 0) {
    logger.info(chalk.yellow('No namespaces found on this registry.'))
    return
  }

  logger.info(chalk.bold(`Namespaces (${namespaces.length}):`))
  for (const ns of namespaces) {
    logger.info(`  ${chalk.cyan(ns)}`)
  }
}

/**
 * Print the registries available in a namespace.
 *
 * @param namespace  - Namespace being listed
 * @param registries - Registry names under the namespace
 * @param logger     - Logger for output
 */
export function displayRegistries(
  namespace: string,
  registries: string[],
  logger: Logger
): void {
  if (registries.length === 0) {
    logger.info(
      chalk.yellow(`No registries found in namespace ${chalk.bold(namespace)}.`)
    )
    return
  }

  logger.info(
    chalk.bold(`Registries in ${chalk.cyan(namespace)} (${registries.length}):`)
  )
  for (const name of registries) {
    logger.info(`  ${chalk.green(`${namespace}/${name}`)}`)
  }
}
