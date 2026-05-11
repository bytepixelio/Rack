/**
 * File merge engine — apply merge strategies to write registry files.
 *
 * Supports four builtin strategies (`json`, `ignore`, `env`, `overwrite`)
 * and async custom plugins. Strategy is auto-detected from filename or
 * explicitly declared in the registry file descriptor.
 *
 * @example
 * ```ts
 * const result = await merge({
 *   filePath: 'package.json',
 *   currentContent: '{"name":"demo"}',
 *   incomingContent: '{"version":"1.0.0"}'
 * })
 * ```
 */

import path from 'node:path'
import { MergeError } from '../../utils/errors.js'
import { executePlugin } from './plugin-loader.js'
import {
  envMerge,
  jsonMerge,
  ignoreMerge,
  mergeInternals,
  overwriteMerge
} from './strategies.js'

import type {
  Language,
  RegistryFile,
  MergeStrategyConfig
} from '../../registry/types.js'

// Re-export for tests
export { mergeInternals }

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Merge strategy identifier.
 */
export type MergeStrategyId = 'json' | 'ignore' | 'overwrite' | 'env' | 'custom'

/**
 * Parameters for merging file content.
 */
export interface MergeParams {
  /** Target file path in the destination project. */
  filePath: string
  /** Registry file descriptor for merge strategy resolution. */
  file?: RegistryFile
  /** New content provided by the registry template. */
  incomingContent: string
  /** Existing file contents (if any). */
  currentContent?: string | null
}

/**
 * Warning generated during file merge operations.
 */
export interface MergeWarning {
  /** Warning code identifier. */
  code: string
  /** Human-readable warning message. */
  message: string
  /** Additional warning details. */
  details?: Record<string, unknown>
}

/**
 * Result of a file merge operation.
 */
export interface MergeResult {
  /** Merged file content. */
  content: string
  /** Whether the content changed from current. */
  changed: boolean
  /** Warnings generated during merge. */
  warnings: MergeWarning[]
  /** Merge strategy used. */
  strategy: MergeStrategyId
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Known JSON configs that should use deep merge semantics. */
const JSON_CONFIG_FILES = new Set([
  'rack.json',
  'package.json',
  'jsconfig.json',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.base.json'
])

/** Text files that expect line-dedupe behaviour. */
const IGNORE_FILES = new Set([
  '.gitignore',
  '.npmignore',
  '.dockerignore',
  '.eslintignore',
  '.prettierignore'
])

/** Dispatch table — new strategies can be registered in one place. */
const STRATEGIES: Record<
  Exclude<MergeStrategyId, 'custom'>,
  (params: {
    filePath: string
    currentContent: string | null
    incomingContent: string
  }) => Omit<MergeResult, 'strategy'>
> = {
  env: envMerge,
  json: jsonMerge,
  ignore: ignoreMerge,
  overwrite: overwriteMerge
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Merge file content — supports both builtin strategies and custom plugins.
 *
 * Delegates to {@link mergeBuiltin} for builtin strategies, or loads
 * and executes a custom plugin for `type: 'custom'` strategies.
 *
 * @param params - Merge parameters plus optional plugin context
 * @param params.registryUrl - Registry URL (required for custom plugins)
 * @param params.language - Language variant passed to custom plugins
 * @returns Merge result describing the merged content and strategy used
 * @throws {MergeError} If strategy resolution or execution fails
 *
 * @example
 * ```ts
 * const result = await merge({
 *   filePath: 'package.json',
 *   currentContent: '{"name":"demo"}',
 *   incomingContent: '{"version":"1.0.0"}'
 * })
 * ```
 */
export async function merge(
  params: MergeParams & {
    registryUrl?: string
    language?: Language
  }
): Promise<MergeResult> {
  const resolved = resolveStrategy(params.filePath, params.file)

  if (typeof resolved === 'object' && resolved.type === 'custom') {
    if (!params.registryUrl) {
      throw new MergeError(
        'registryUrl is required for custom merge strategies',
        params.filePath
      )
    }

    return executePlugin(
      resolved,
      params.registryUrl,
      {
        file: params.file,
        filePath: params.filePath,
        currentContent: params.currentContent,
        incomingContent: params.incomingContent
      },
      { language: params.language }
    )
  }

  return mergeBuiltin(resolved as MergeStrategyId, params)
}

/**
 * Merge file content synchronously using a specific builtin strategy.
 *
 * @param strategy - Builtin strategy to use
 * @param params - Merge parameters
 * @returns Merge result describing the merged content and strategy used
 * @throws {MergeError} If strategy is unknown
 */
export function mergeBuiltin(
  strategy: MergeStrategyId,
  params: MergeParams
): MergeResult {
  const strategyFn = STRATEGIES[strategy as Exclude<MergeStrategyId, 'custom'>]

  if (!strategyFn) {
    throw new MergeError(`Unknown merge strategy: ${strategy}`, params.filePath)
  }

  return {
    ...strategyFn({
      filePath: params.filePath,
      incomingContent: params.incomingContent,
      currentContent: params.currentContent ?? null
    }),
    strategy
  }
}

/**
 * Infer a merge strategy from the file name or registry file descriptor.
 *
 * @param filePath - File path to analyze
 * @param file - Registry file descriptor containing merge strategy configuration
 * @returns Strategy ID for builtins, or full config for custom plugins
 *
 * @example
 * ```ts
 * resolveStrategy('package.json')  // => 'json'
 * resolveStrategy('.env.local')    // => 'env'
 * resolveStrategy('.gitignore')    // => 'ignore'
 * resolveStrategy('README.md')     // => 'overwrite'
 * ```
 */
export function resolveStrategy(
  filePath: string,
  file?: RegistryFile
): MergeStrategyId | MergeStrategyConfig {
  if (file?.mergeStrategy) {
    const { mergeStrategy } = file
    return mergeStrategy.type === 'builtin'
      ? (mergeStrategy.strategy as MergeStrategyId)
      : mergeStrategy
  }

  const base = path.basename(filePath)

  if (JSON_CONFIG_FILES.has(base) || base.endsWith('.schema.json')) {
    return 'json'
  }

  if (IGNORE_FILES.has(base)) {
    return 'ignore'
  }

  if (base.startsWith('.env')) {
    return 'env'
  }

  return 'overwrite'
}
