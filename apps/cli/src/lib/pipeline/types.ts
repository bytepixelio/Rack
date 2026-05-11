/**
 * Pipeline domain types.
 *
 * Types that flow through every pipeline phase live here:
 * {@link PipelineContext}, {@link PipelineResult}, {@link InstallPlan},
 * and {@link FileChange}. `ResolvedRegistryItem` lives in
 * `registry/types.ts` (it's a registry concept — a fetched item with
 * provenance) and is re-exported below for convenience.
 *
 * @example
 * ```ts
 * import type { InstallPlan, PipelineResult } from './types.js'
 * ```
 */

import type { Logger } from '../infra/logger.js'
import type { Language, ResolvedRegistryItem } from '../registry/types.js'

export type { ResolvedRegistryItem }

// ─── File Change ────────────────────────────────────────────────────────────

/**
 * File change record produced during the apply phase.
 */
export interface FileChange {
  /** Target file path. */
  path: string
  /** Merge strategy used. */
  strategy?: string
  /** Warnings generated during merge. */
  warnings?: string[]
  /** Change type. */
  type: 'created' | 'modified' | 'skipped'
}

// ─── Pipeline Context ───────────────────────────────────────────────────────

/**
 * Pipeline context — carries only what pipeline phases actually need.
 */
export interface PipelineContext {
  /** Logger for pipeline output. */
  logger: Logger
  /** Target directory. */
  targetDir: string
  /** Language variant (optional — each registry can use its own defaultLanguage). */
  language?: Language
  /** Current operation (`'init'` or `'add'`). */
  operation?: 'init' | 'add'
  /** Registry identifiers already installed in the project. */
  installedRegistries?: string[]
}

// ─── Install Plan ───────────────────────────────────────────────────────────

/**
 * Explicit model of what an install will do, produced by
 * {@link buildInstallPlan}.
 *
 * Each field names one role a registry can play in a single `rk init` or
 * `rk add` invocation. Splitting them apart (instead of compressing
 * everything into a single "items" list) is what lets callers reason
 * about "skip already-installed", "enforce reciprocal conflict from a
 * skipped dep", and "record only what we wrote" without juggling
 * parallel arrays at the pipeline level.
 *
 * Invariants:
 *
 * - `requested` is exactly what the caller asked for. For `rk add` that's
 *   the single CLI argument; for `rk init` it's every root coming out of
 *   `fetchTemplate` (a preset expands to several).
 * - `resolvedDependencies` contains transitive deps discovered by BFS,
 *   minus anything already in `alreadyInstalled` and minus the roots.
 * - `alreadyInstalled` is fetched only so reciprocal `conflicts` arrays
 *   declared by previously-installed registries can still block the new
 *   install. These items are **not** written to disk again.
 * - `toApply` is the union of `requested` + `resolvedDependencies`,
 *   sorted topologically by dependency depth then by `priority`. This is
 *   what `applyFiles` and `resolveDependencies` consume.
 * - `toRecord` is the identifier list appended to `rack.json`. Equal to
 *   `toApply.map(i => i.identifier)` today; kept separate so future
 *   features (e.g. recording only roots) can diverge without reshaping
 *   the plan.
 */
export interface InstallPlan {
  /** User-requested root items, already fetched. */
  requested: ResolvedRegistryItem[]
  /** Transitive deps to apply (excludes `requested` and `alreadyInstalled`). */
  resolvedDependencies: ResolvedRegistryItem[]
  /** Items already on disk; participate in conflict checks only. */
  alreadyInstalled: ResolvedRegistryItem[]
  /** Items to write to disk + merge into package.json, in apply order. */
  toApply: ResolvedRegistryItem[]
  /** Identifiers to append to rack.json (typically `toApply` identifiers). */
  toRecord: string[]
}

// ─── Pipeline Result ────────────────────────────────────────────────────────

/**
 * Pipeline result returned after init or add completes successfully.
 *
 * Failures are signaled by thrown {@link AppError}, not by a `success` flag.
 */
export interface PipelineResult {
  /** Target directory. */
  targetDir: string
  /** File changes made. */
  fileChanges: FileChange[]
  /** Registries that were applied. */
  appliedRegistries: string[]
  /** Initial registry identifiers (user-specified, excluding dependencies). */
  initialRegistries: string[]
  /** Resolved registry items (all registries including dependencies). */
  items: ResolvedRegistryItem[]
  /** Scripts added. */
  scripts: Record<string, string>
  /** Dependencies installed. */
  dependencies: Record<string, string>
  /** Dev dependencies installed. */
  devDependencies: Record<string, string>
}
