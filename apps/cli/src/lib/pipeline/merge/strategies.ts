/**
 * Builtin merge strategy implementations.
 *
 * Four strategies: `json` (deep merge), `ignore` (line dedup),
 * `env` (key-based update), `overwrite` (verbatim replace).
 * Each returns `{ content, changed, warnings }` — the caller
 * attaches the strategy identifier.
 *
 * @example
 * ```ts
 * const result = jsonMerge({
 *   filePath: 'package.json',
 *   currentContent: '{"name":"demo"}',
 *   incomingContent: '{"version":"1.0.0"}'
 * })
 * ```
 */

import { MergeError } from '../../utils/errors.js'
import {
  isEqual,
  cloneDeep,
  unionWith,
  isPlainObject,
  dropRightWhile
} from 'lodash-es'

// ─── Types ──────────────────────────────────────────────────────────────────

/** Common parameter shape for all builtin strategies. */
export interface StrategyParams {
  filePath: string
  incomingContent: string
  currentContent: string | null
}

/** Return shape for all builtin strategies. */
export interface StrategyResult {
  content: string
  changed: boolean
  warnings: {
    code: string
    message: string
    details?: Record<string, unknown>
  }[]
}

// ─── JSON Merge ─────────────────────────────────────────────────────────────

/**
 * Deep merge JSON documents with Rack-specific rules: objects merge recursively,
 * arrays dedupe while keeping order, scalars are overridden by the incoming value.
 *
 * @param params.filePath Logical file path used for error reporting.
 * @param params.currentContent Current JSON payload (string).
 * @param params.incomingContent Incoming JSON payload (string).
 * @example
 * ```ts
 * const merged = jsonMerge({
 *   filePath: 'package.json',
 *   currentContent: '{"scripts":{"dev":"node"}}',
 *   incomingContent: '{"scripts":{"dev":"vite","test":"vitest"}}'
 * })
 * ```
 */
export function jsonMerge(params: StrategyParams): StrategyResult {
  const { currentContent, incomingContent, filePath } = params
  const base = safeParseJson(currentContent, filePath)
  const incoming = safeParseJson(incomingContent, filePath)

  if (!isPlainObject(base) || !isPlainObject(incoming)) {
    throw new MergeError('JSON merge requires object inputs', filePath)
  }

  const merged = deepMergeObjects(
    base as Record<string, unknown>,
    incoming as Record<string, unknown>
  )
  const content = `${JSON.stringify(merged, null, 2)}\n`

  return {
    content,
    warnings: [],
    changed: content !== normalizeNull(currentContent)
  }
}

/**
 * Parse JSON content while mapping failures to {@link MergeError}.
 *
 * @param source JSON string to parse (or null for empty object).
 * @param filePath Path used when throwing {@link MergeError}.
 */
function safeParseJson(source: string | null, filePath: string): unknown {
  if (source === null) return {}

  try {
    return JSON.parse(source)
  } catch (error) {
    throw new MergeError(
      `Failed to parse JSON before merge: ${(error as Error).message}`,
      filePath
    )
  }
}

/**
 * Recursively merge two plain objects.
 * Objects merge recursively, arrays dedupe, scalars are overridden.
 *
 * @param base Existing JSON object.
 * @param incoming Incoming JSON object to merge.
 * @returns A new object containing the merged result.
 */
function deepMergeObjects(
  base: Record<string, unknown>,
  incoming: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = cloneDeep(base)

  for (const [key, value] of Object.entries(incoming)) {
    const existing = result[key]
    if (isPlainObject(existing) && isPlainObject(value)) {
      result[key] = deepMergeObjects(
        existing as Record<string, unknown>,
        value as Record<string, unknown>
      )
      continue
    }

    if (Array.isArray(existing) && Array.isArray(value)) {
      result[key] = unionWith(existing, value, isEqual)
      continue
    }

    result[key] = value
  }

  return result
}

// ─── Ignore Merge ───────────────────────────────────────────────────────────

/**
 * Append unique ignore entries while preserving ordering and coalescing blank lines.
 *
 * @param params.filePath Ignore file path (used for logging only).
 * @param params.currentContent Existing ignore file content.
 * @param params.incomingContent Incoming ignore entries.
 * @example
 * ```ts
 * const merged = ignoreMerge({
 *   filePath: '.gitignore',
 *   currentContent: 'node_modules\n',
 *   incomingContent: 'dist\n\nnode_modules\n'
 * })
 * // merged.content === 'node_modules\ndist\n'
 * ```
 */
export function ignoreMerge(params: StrategyParams): StrategyResult {
  const { currentContent, incomingContent } = params
  const existingLines = splitLines(currentContent)
  const resultLines = [
    ...dropRightWhile(existingLines, (l: string) => !l.trim())
  ]
  const seen = new Set(
    existingLines.map((l) => l.trim()).filter((l) => l.length > 0)
  )
  const incomingLines = dropRightWhile(
    splitLines(incomingContent),
    (l: string) => !l.trim()
  )

  for (const line of incomingLines) {
    const key = line.trim()
    if (key === '') {
      if (resultLines.at(-1)?.trim() !== '') {
        resultLines.push(line)
      }
      continue
    }

    if (!seen.has(key)) {
      resultLines.push(line)
      seen.add(key)
    }
  }

  const content = joinLines(resultLines)

  return {
    content,
    warnings: [],
    changed: content !== normalizeNull(currentContent)
  }
}

// ─── Overwrite Merge ────────────────────────────────────────────────────────

/**
 * Default merge strategy: later registries overwrite earlier content verbatim.
 *
 * @param params.filePath Target file path.
 * @param params.currentContent Existing text content.
 * @param params.incomingContent Incoming text content.
 */
export function overwriteMerge(params: StrategyParams): StrategyResult {
  const { currentContent, incomingContent } = params
  const content = ensureTrailingNewline(incomingContent)

  return {
    content,
    warnings: [],
    changed: content !== normalizeNull(currentContent)
  }
}

// ─── Env Merge ──────────────────────────────────────────────────────────────

/**
 * Merge .env-style key/value files while preserving comments and relative ordering.
 * Existing keys are updated in place, new keys are appended.
 *
 * @param params.filePath Env file path (for logging only).
 * @param params.currentContent Existing env content.
 * @param params.incomingContent Incoming env content.
 * @example
 * ```ts
 * const merged = envMerge({
 *   filePath: '.env',
 *   currentContent: 'FOO=one\n# note\n',
 *   incomingContent: 'FOO=two\nBAR=three\n'
 * })
 * // merged.content === 'FOO=two\n# note\nBAR=three\n'
 * ```
 */
export function envMerge(params: StrategyParams): StrategyResult {
  const { currentContent, incomingContent } = params
  const baseLines = [
    ...dropRightWhile(splitLines(currentContent), (l: string) => !l.trim())
  ]
  const keyIndex = buildEnvKeyIndex(baseLines)

  for (const line of splitLines(incomingContent)) {
    const parsed = parseEnvLine(line)
    if (!parsed) {
      // Non-key line (comment, blank) — append unless it duplicates a trailing blank
      if (!(line.trim() === '' && baseLines.at(-1)?.trim() === '')) {
        baseLines.push(line)
      }
      continue
    }

    if (keyIndex.has(parsed.key)) {
      const index = keyIndex.get(parsed.key)!
      const original = baseLines[index]
      const prefix = original.includes('=')
        ? original.slice(0, original.indexOf('=') + 1)
        : `${parsed.key}=`
      baseLines[index] = `${prefix}${parsed.value}`
    } else {
      keyIndex.set(parsed.key, baseLines.length)
      baseLines.push(`${parsed.key}=${parsed.value}`)
    }
  }

  const content = joinLines(baseLines)

  return {
    content,
    warnings: [],
    changed: content !== normalizeNull(currentContent)
  }
}

/**
 * Parse a `.env` style line into `{ key, value }` pairs.
 * Lines that are comments or do not contain `=` return null.
 *
 * @param line - Environment variable line to parse
 * @returns Parsed key/value pair or null if line is invalid
 */
function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null

  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
  if (!match) return null

  const [, key, value] = match
  return { key, value }
}

/**
 * Build a key → line-index map for env files so repeated keys can be replaced in place.
 *
 * @param lines - Environment file lines
 * @returns Map of key → line index
 */
function buildEnvKeyIndex(lines: string[]): Map<string, number> {
  const keyIndex = new Map<string, number>()

  for (let i = 0; i < lines.length; i++) {
    const parsed = parseEnvLine(lines[i])
    if (parsed && !keyIndex.has(parsed.key)) {
      keyIndex.set(parsed.key, i)
      continue
    }
    const fallback = lines[i].match(/^[A-Za-z_][A-Za-z0-9_]*$/)
    if (fallback && !keyIndex.has(fallback[0])) {
      keyIndex.set(fallback[0], i)
    }
  }

  return keyIndex
}

// ─── Shared Text Helpers ────────────────────────────────────────────────────

/**
 * Split text into normalized `\n` lines while handling null/empty strings.
 *
 * @param content - Text content to split (may be null)
 * @returns Array of lines with normalized line endings
 */
function splitLines(content: string | null): string[] {
  if (!content) return []
  return content.replace(/\r\n/g, '\n').split('\n')
}

/**
 * Join lines using `\n` and ensure the result ends with a newline.
 *
 * @param lines - Array of lines to join
 * @returns Joined string ending with newline
 */
function joinLines(lines: string[]): string {
  return ensureTrailingNewline(lines.join('\n'))
}

/**
 * Normalize null/undefined file content into a newline-terminated string.
 *
 * @param content - Possibly null source content
 * @returns String ending with `\n` (empty string if content missing)
 */
function normalizeNull(content: string | null): string {
  return ensureTrailingNewline(content ?? '')
}

/**
 * Append a trailing newline if the provided string does not already end with one.
 *
 * @param content - Source string
 * @returns String guaranteed to end with `\n`
 */
function ensureTrailingNewline(content: string): string {
  return content.endsWith('\n') ? content : `${content}\n`
}

// ─── Test Internals ─────────────────────────────────────────────────────────

/** @internal Exposed for testing only. */
function hasTrailingBlankDuplicate(lines: string[]): boolean {
  const lastLine = lines.at(-1)
  return lastLine !== undefined && lastLine.trim() === ''
}

export const mergeInternals = {
  hasTrailingBlankDuplicate
}
