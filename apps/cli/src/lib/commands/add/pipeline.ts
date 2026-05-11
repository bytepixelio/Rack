/**
 * `rk add` pipeline — fetch a single root, plan the install, then write.
 *
 * The pipeline is thin: it fetches the user-requested registry, hands
 * everything else (transitive resolution, conflict checks, sort) off to
 * {@link buildInstallPlan}, pre-flights the workspace, and finally
 * commits files + `package.json`. The {@link InstallPlan} returned by
 * the planner names each registry's role explicitly so the apply phase
 * never has to redo "which of these is a transitive dep that's already
 * installed?" guesswork.
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
import { registry } from '../../registry/client.js'
import { isPreset } from '../../registry/identifier.js'
import { preflight } from '../../pipeline/preflight.js'
import { applyFiles } from '../../pipeline/apply.js'
import { buildInstallPlan } from '../../pipeline/install-plan.js'
import {
  logConflicts,
  resolveDependencies
} from '../../pipeline/resolve-versions.js'

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

  // 1. Fetch the requested root. The root's `:js`/`:ts` suffix (if any)
  // wins over `language` (the project default from rack.json) inside
  // fetchItem, and the resolved choice is attached to the returned item
  // so the planner and apply phase propagate the same variant downstream.
  logger.info(`Fetching registry: ${identifier}`)
  const root = await registry.fetchItem(identifier, { language })

  // 2. Build the install plan — transitive deps, already-installed
  // fetches for conflict checking, conflict validation, topo sort.
  const plan = await buildInstallPlan({
    logger,
    language,
    requested: [root],
    installedRegistries
  })
  logger.info(
    `Fetched ${plan.toApply.length} registries (including dependencies)`
  )

  // 3. Preflight — validate `package.json` parses before any disk write,
  // so a corrupted manifest aborts the install *before* registry files
  // land and leave the workspace in a partially-applied state.
  await preflight(targetDir)

  // 4. Apply files.
  logger.info('Applying files')
  const fileChanges = await applyFiles(plan.toApply, targetDir, logger)

  // 5. Collect dependencies and scripts from the items that actually
  // landed.
  const { dependencies, devDependencies, conflicts } = resolveDependencies(
    plan.toApply
  )
  logConflicts(conflicts, logger)

  const scripts: Record<string, string> = {}
  for (const item of plan.toApply) {
    if (item.scripts) Object.assign(scripts, item.scripts)
  }

  // 6. Merge into package.json.
  await pkg.update(targetDir, { dependencies, devDependencies, scripts })

  return {
    targetDir,
    fileChanges,
    scripts,
    dependencies,
    devDependencies,
    items: plan.toApply,
    initialRegistries: [identifier],
    appliedRegistries: plan.toRecord
  }
}
