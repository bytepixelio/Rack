/**
 * Pipeline domain types.
 *
 * Types that flow through every pipeline phase live here:
 * {@link PipelineContext}, {@link PipelineResult}, and {@link FileChange}.
 * `ResolvedRegistryItem` lives in `registry/types.ts` (it's a registry
 * concept — a fetched item with provenance) and is re-exported below
 * for convenience.
 *
 * @example
 * ```ts
 * import type { PipelineContext, PipelineResult } from './types.js'
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
