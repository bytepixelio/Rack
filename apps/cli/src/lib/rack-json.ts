/**
 * `rack.json` project manifest management.
 *
 * Handles reading, writing, generating, and updating the project-level
 * configuration file that tracks installed registries and language settings.
 *
 * @example
 * ```ts
 * import { rackJson } from './rack-json.js'
 * const config = await rackJson.read('/path/to/project')
 * await rackJson.update('/path/to/project', ['@rack/tailwindcss'])
 * ```
 */

import path from 'node:path'
import { isPlainObject, isString } from 'lodash-es'
import { pathExists, readJSON, writeJSON } from './infra/fs.js'
import { parseNamespace } from './registry/identifier.js'
import { RackJsonError, getErrorMessage } from './utils/errors.js'

import type { Language } from './registry/types.js'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Error code for rack.json specific issues.
 */
export type RackJsonErrorCode =
  | 'NOT_FOUND'
  | 'INVALID'
  | 'READ_FAILED'
  | 'WRITE_FAILED'

/**
 * Rack.json project manifest structure.
 */
export interface RackJsonConfig {
  /** Project name */
  name: string
  /** Installed registry identifiers */
  items?: string[]
  /** JSON Schema reference */
  $schema?: string
  /** Template used to initialize the project */
  template?: string
  /** Language variant (js or ts) */
  language?: Language
}

// ─── Internal ────────────────────────────────────────────────────────────────

/**
 * Resolve the absolute path to rack.json in a directory.
 *
 * @param targetDir - Project directory
 * @returns Absolute path to rack.json
 */
function rackJsonPath(targetDir: string): string {
  return path.join(targetDir, 'rack.json')
}

/**
 * Normalize an identifier to `namespace/path` for deduplication.
 */
function canonicalize(identifier: string): string {
  const { namespace, path: p } = parseNamespace(identifier)
  return `${namespace}/${p}`
}

/**
 * Deduplicate identifiers by canonical form, keeping the first occurrence.
 */
function uniqByCanonical(items: string[]): string[] {
  const seen = new Set<string>()
  return items.filter((id) => {
    const key = canonicalize(id)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Generate a new rack.json object with sensible defaults.
 * Only includes optional fields when they have values.
 *
 * @param params - Project metadata
 * @returns A rack.json-conformant object
 */
function generate(
  params: Pick<RackJsonConfig, 'name' | 'language' | 'template' | 'items'>
): RackJsonConfig {
  const { name, language, template, items = [] } = params

  return {
    $schema: 'https://registry.rackjs.com/schemas/rack.json',
    name,
    ...(language && { language }),
    ...(template && { template }),
    ...(items.length > 0 && { items })
  }
}

/**
 * Read and parse rack.json from a directory.
 *
 * @param targetDir - Project directory
 * @returns Parsed rack.json contents
 * @throws {RackJsonError} With code `NOT_FOUND` if the file is missing
 * @throws {RackJsonError} With code `INVALID` if the file is malformed
 * @throws {RackJsonError} With code `READ_FAILED` on unexpected I/O errors
 */
async function read(targetDir: string): Promise<RackJsonConfig> {
  const filePath = rackJsonPath(targetDir)

  if (!(await pathExists(filePath))) {
    throw new RackJsonError(
      `rack.json not found in ${targetDir}. This does not appear to be a Rack project.`,
      'NOT_FOUND'
    )
  }

  let content: unknown
  try {
    content = await readJSON(filePath)
  } catch (error) {
    throw new RackJsonError(
      `Failed to read rack.json: ${getErrorMessage(error)}`,
      'READ_FAILED'
    )
  }

  if (!isPlainObject(content)) {
    throw new RackJsonError('rack.json is not a valid JSON object', 'INVALID')
  }

  const obj = content as Record<string, unknown>

  if (!obj.name || !isString(obj.name)) {
    throw new RackJsonError(
      'rack.json is missing required field: name',
      'INVALID'
    )
  }

  if (obj.items !== undefined) {
    if (!Array.isArray(obj.items) || !obj.items.every(isString)) {
      throw new RackJsonError(
        'rack.json field "items" must be an array of strings',
        'INVALID'
      )
    }
  }

  if (obj.language !== undefined) {
    if (obj.language !== 'js' && obj.language !== 'ts') {
      throw new RackJsonError(
        'rack.json field "language" must be "js" or "ts"',
        'INVALID'
      )
    }
  }

  if (obj.template !== undefined) {
    if (!isString(obj.template)) {
      throw new RackJsonError(
        'rack.json field "template" must be a string',
        'INVALID'
      )
    }
  }

  return obj as unknown as RackJsonConfig
}

/**
 * Read rack.json, or generate and write a default one if it doesn't exist.
 *
 * @param targetDir - Project directory
 * @returns Parsed rack.json contents (existing or newly created)
 */
async function readOrCreate(targetDir: string): Promise<RackJsonConfig> {
  try {
    return await read(targetDir)
  } catch (error) {
    if (error instanceof RackJsonError && error.errorCode === 'NOT_FOUND') {
      const config = generate({ name: path.basename(targetDir) })
      await writeJSON(rackJsonPath(targetDir), config, 2)
      return config
    }
    throw error
  }
}

/**
 * Append new registry items to rack.json (deduplicated).
 *
 * @param targetDir - Project directory
 * @param newItems - Registry identifiers to add
 * @throws {RackJsonError} With code `WRITE_FAILED` on I/O errors
 */
async function update(targetDir: string, newItems: string[]): Promise<void> {
  const config = await read(targetDir)
  config.items = uniqByCanonical([...(config.items || []), ...newItems])

  try {
    await writeJSON(rackJsonPath(targetDir), config)
  } catch (error) {
    throw new RackJsonError(
      `Failed to write rack.json: ${getErrorMessage(error)}`,
      'WRITE_FAILED'
    )
  }
}

// ─── Namespace Export ────────────────────────────────────────────────────────

export const rackJson = {
  read,
  update,
  generate,
  readOrCreate
}
