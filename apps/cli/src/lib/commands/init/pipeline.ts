/**
 * `rk init` pipeline — fetch a preset / single registry, plan, then write.
 *
 * The pipeline is thin: it expands the template into root items via
 * {@link fetchTemplate}, hands transitive resolution + conflict checks +
 * sort to {@link buildInstallPlan}, pre-flights the workspace, and
 * commits files + `package.json`. The {@link InstallPlan} returned by
 * the planner names every role explicitly so the apply phase consumes
 * `plan.toApply` directly instead of juggling parallel arrays.
 *
 * @example
 * ```ts
 * const result = await initProject(
 *   { template: '@presets/vue', targetDir: '/path' },
 *   'ts',
 *   logger
 * )
 * ```
 */

import { pkg } from '../../pkg.js'
import { fetchTemplate } from './fetch.js'
import { applyFiles } from '../../pipeline/apply.js'
import { preflight } from '../../pipeline/preflight.js'
import { buildInstallPlan } from '../../pipeline/install-plan.js'
import {
  logConflicts,
  resolveDependencies
} from '../../pipeline/resolve-versions.js'

import type { Logger } from '../../infra/logger.js'
import type { Language } from '../../registry/types.js'
import type { PipelineResult } from '../../pipeline/types.js'

// ─── Types ──────────────────────────────────────────────────────────────────

/** Parameters for initializing a project. */
export interface InitProjectParams {
  /** Template identifier (preset or single registry). */
  template: string
  /** Target directory for the project. */
  targetDir: string
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Initialize a project from a template (preset or single registry).
 *
 * @param params - Init parameters (template + targetDir)
 * @param language - Language variant override
 * @param logger - Logger instance
 * @returns Pipeline result with applied registries, file changes, and dependencies
 */
export async function initProject(
  params: InitProjectParams,
  language: Language | undefined,
  logger: Logger
): Promise<PipelineResult> {
  const { template, targetDir } = params

  // 1. Fetch. A `:js`/`:ts` suffix on a single-registry template, or on
  // any preset member, wins over `language` (the CLI-level default) for
  // that item; the resolved choice is attached to each item so the
  // planner and apply phase propagate the same variant downstream.
  logger.info('Starting initialization pipeline')
  const roots = await fetchTemplate(template, { language, logger })
  logger.info(`Fetched ${roots.length} registries`)

  // 2. Build the install plan — transitive resolution, conflict check,
  // topo sort. `installedRegistries` is empty for `rk init` (fresh
  // project), so `alreadyInstalled` is also empty.
  const plan = await buildInstallPlan({ logger, requested: roots })
  logger.info(
    `Total registries (including dependencies): ${plan.toApply.length}`
  )

  // 3. Preflight — only meaningful when `--force` lands us in an
  // existing directory; for a fresh init the file doesn't exist and the
  // check is a cheap no-op.
  await preflight(targetDir)

  // 4. Apply files.
  logger.info('Applying files')
  const fileChanges = await applyFiles(plan.toApply, targetDir, logger)

  // 5. Collect dependencies and scripts.
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
    appliedRegistries: plan.toRecord,
    initialRegistries: plan.requested.map((item) => item.identifier)
  }
}
