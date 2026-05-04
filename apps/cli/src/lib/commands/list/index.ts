/**
 * `rk list` command — discover namespaces and registries on a registry server.
 *
 * With no argument, lists namespaces on the default registry.
 * With a namespace argument, lists registries under that namespace.
 * `--json` emits machine-readable output for AI / scripted callers.
 */

import { Command } from 'commander'
import { rackrc } from '../../rackrc.js'
import { listHelpText } from './help.js'
import { Logger } from '../../infra/logger.js'
import { HttpClient } from '../../infra/http.js'
import { DEFAULT_NAMESPACE } from '../../../constants.js'
import { displayNamespaces, displayRegistries } from './display.js'

// ─── Types ──────────────────────────────────────────────────────────────────

interface ListCommandOptions {
  json?: boolean
  registry?: string
}

interface NamespacesResponse {
  namespaces: string[]
}

interface RegistriesResponse {
  namespace: string
  registries: string[]
}

// ─── Command ────────────────────────────────────────────────────────────────

/**
 * Register the 'list' command.
 *
 * @param program - Commander.js program instance
 */
export function registerListCommand(program: Command): void {
  program
    .command('list')
    .description('Discover namespaces and registries on a registry server')
    .argument(
      '[namespace]',
      'Namespace to list registries for (e.g., @rack); omit to list namespaces'
    )
    .option('--json', 'Output in JSON format')
    .option(
      '--registry <namespace>',
      'Registry namespace to query (default: @rack)'
    )
    .addHelpText('after', listHelpText)
    .action(
      async (
        namespace: string | undefined,
        options: ListCommandOptions
      ): Promise<void> => {
        const logger = new Logger()
        const http = new HttpClient()

        try {
          const target = options.registry ?? DEFAULT_NAMESPACE
          const registry = await rackrc.getRegistry(target)
          const baseUrl = registry.url.replace(/\/+$/, '')

          if (namespace) {
            const { data } = await http.get<RegistriesResponse>(
              `${baseUrl}/namespaces/${encodeURIComponent(namespace)}/registries`,
              { headers: registry.headers }
            )
            if (options.json) {
              console.log(JSON.stringify(data, null, 2))
            } else {
              displayRegistries(data.namespace, data.registries, logger)
            }
          } else {
            const { data } = await http.get<NamespacesResponse>(
              `${baseUrl}/namespaces`,
              { headers: registry.headers }
            )
            if (options.json) {
              console.log(JSON.stringify(data, null, 2))
            } else {
              displayNamespaces(data.namespaces, logger)
            }
          }
        } catch (error) {
          logger.commandError('List', error)
          process.exit(1)
        }
      }
    )
}
