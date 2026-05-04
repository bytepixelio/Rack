/**
 * `rk version` command — display CLI and environment information.
 */

import chalk from 'chalk'
import { rackrc } from '../../rackrc.js'
import { versionHelpText } from './help.js'
import { Logger } from '../../infra/logger.js'
import { getCliVersion } from '../../utils/version.js'

import type { Command } from 'commander'

/**
 * Register the version command with Commander.js.
 *
 * @param program - Commander.js program instance
 */
export function registerVersionCommand(program: Command): void {
  program
    .command('version')
    .description('Display CLI information')
    .addHelpText('after', versionHelpText)
    .action(async () => {
      const logger = new Logger()
      const { version, platform, arch } = process
      const configPath = rackrc.getConfigPath()

      logger.info(
        `${chalk.blue('Version:')} ${chalk.green(await getCliVersion())}`
      )
      logger.info(`${chalk.blue('Node.js:')} ${chalk.green(version)}`)
      logger.info(
        `${chalk.blue('Platform:')} ${chalk.green(`${platform}/${arch}`)}`
      )
      logger.info(`${chalk.blue('Config:')} ${chalk.green(configPath)}`)
    })
}
