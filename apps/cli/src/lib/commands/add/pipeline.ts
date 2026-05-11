/**
 * `rk add` pipeline — fetch, resolve, and apply a single registry.
 *
 * Self-contained pipeline for the add command. Fetches the registry
 * and its dependencies, checks conflicts against installed registries,
 * applies files, and merges dependencies into package.json.
 *
 * @example
 * ```ts
 * const result = await addRegistry(
 *   { identifier: '@rack/tailwindcss', targetDir: '/project', installedRegistries: ['@rack/vue'] },
 *   logger
 * )
 * ```
 */

import { pkg } from '../../pkg.js'
import { AppError } from '../../utils/errors.js'
import { sortItems } from '../../pipeline/sort.js'
import { registry } from '../../registry/client.js'
import { applyFiles } from '../../pipeline/apply.js'
import { validateNoConflicts } from '../../pipeline/conflict.js'
import { isPreset, canonicalizeIdentifier } from '../../registry/identifier.js'
import {
  logConflicts,
  resolveDependencies
} from '../../pipeline/resolve-versions.js'
import { resolveRegistryDependencies } from '../../pipeline/resolve-dependencies.js'

import type { Logger } from '../../infra/logger.js'
import type { Language } from '../../registry/types.js'
import type { PipelineResult } from '../../pipeline/types.js'

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Parameters for the add pipeline.
 */
export interface AddRegistryParams {
  /** Absolute path to the target project directory. */
  targetDir: string
  /** Registry identifier to add (e.g., `@rack/tailwindcss`). */
  identifier: string
  /** Language variant override. */
  language?: Language
  /** Registry identifiers already installed in the project. */
  installedRegistries?: string[]
}

// ─── Pipeline ───────────────────────────────────────────────────────────────

/**
 * Run the add pipeline for a single registry.
 *
 * @param params - Add registry parameters
 * @param logger - Logger instance
 * @returns Pipeline result with applied registries, file changes, and dependencies
 */
export async function addRegistry(
  params: AddRegistryParams,
  logger: Logger
): Promise<PipelineResult> {
  const { targetDir, language, identifier, installedRegistries = [] } = params

  if (isPreset(identifier)) {
    throw new AppError(
      'INVALID_USAGE',
      `Preset is not supported in 'rk add'. Use 'rk init -t ${identifier}' or add individual registries.`
    )
  }

  // 1. Fetch the registry
  logger.info(`Fetching registry: ${identifier}`)
  const root = await registry.fetchItem(identifier, { language })

  // 2. Resolve dependencies (BFS)
  const resolved = await resolveRegistryDependencies([root], language, logger)
  logger.info(`Fetched ${resolved.length} registries (including dependencies)`)

  // 3. Conflict check (new + installed)
  const installedItems = await registry.fetchItems(installedRegistries, {
    language,
    logger
  })
  warnDegradedConflictCheck(installedRegistries, installedItems, logger)
  validateNoConflicts([...installedItems, ...resolved], installedRegistries)

  // 4. Sort
  const items = sortItems(resolved)

  // 5. Apply files
  logger.info('Applying files')
  const fileChanges = await applyFiles(items, targetDir, language, logger)

  // 6. Collect dependencies and scripts
  const { dependencies, devDependencies, conflicts } =
    resolveDependencies(items)
  logConflicts(conflicts, logger)

  const scripts: Record<string, string> = {}
  for (const item of items) {
    if (item.scripts) Object.assign(scripts, item.scripts)
  }

  // 7. Merge into package.json
  await pkg.update(targetDir, { dependencies, devDependencies, scripts })

  return {
    items,
    scripts,
    targetDir,
    fileChanges,
    dependencies,
    devDependencies,
    initialRegistries: [identifier],
    appliedRegistries: items.map((i) => i.identifier)
  }
}

// ─── Internal ───────────────────────────────────────────────────────────────

/**
 * Surface a clear warning when one or more installed registries failed to
 * fetch — without it, an offline / unreachable registry whose `conflicts`
 * array would have blocked the new install silently passes the conflict
 * check via the identifier-only fallback in {@link validateNoConflicts}.
 */
function warnDegradedConflictCheck(
  requested: string[],
  fetched: { identifier: string }[],
  logger: Logger
): void {
  if (requested.length === 0 || fetched.length === requested.length) return

  const fetchedKeys = new Set(
    fetched.map((it) => canonicalizeIdentifier(it.identifier))
  )
  const missing = requested.filter(
    (id) => !fetchedKeys.has(canonicalizeIdentifier(id))
  )
  if (missing.length === 0) return

  logger.warn(
    `Conflict check is degraded: could not fetch installed ${pluralize(missing.length, 'registry', 'registries')} ` +
      `${missing.join(', ')}. Reciprocal "conflicts" declared by ` +
      `${missing.length === 1 ? 'this registry' : 'these registries'} cannot be enforced.`
  )
}

function pluralize(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}
