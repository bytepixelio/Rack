/**
 * `rk init` pipeline — fetch, resolve, and apply a preset or single registry.
 *
 * Self-contained pipeline for the init command. Coordinates phases:
 * fetch → resolve → validate → sort → apply → collect → merge.
 * Returns a {@link PipelineResult}; throws {@link AppError} on failure.
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
import { sortItems } from '../../pipeline/sort.js'
import { applyFiles } from '../../pipeline/apply.js'
import { validateNoConflicts } from '../../pipeline/conflict.js'
import { resolveRegistryDependencies } from '../../pipeline/resolve-dependencies.js'
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
  // that item; the resolved choice is attached to each item so steps 2
  // and 5 propagate the same variant downstream per branch.
  logger.info('Starting initialization pipeline')
  const roots = await fetchTemplate(template, { language, logger })
  logger.info(`Fetched ${roots.length} registries`)

  const initialRegistries = roots.map((item) => item.identifier)

  // 2. Resolve dependencies (BFS) — each dep inherits its parent's
  // resolvedLanguage rather than getting reset to a single project-wide
  // value at every hop.
  const resolved = await resolveRegistryDependencies(roots, logger)
  logger.info(`Total registries (including dependencies): ${resolved.length}`)

  // 3. Validate conflicts
  validateNoConflicts(resolved)

  // 4. Sort
  const items = sortItems(resolved)

  // 5. Apply files
  logger.info('Applying files')
  const fileChanges = await applyFiles(items, targetDir, logger)

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
    initialRegistries,
    appliedRegistries: items.map((i) => i.identifier)
  }
}
