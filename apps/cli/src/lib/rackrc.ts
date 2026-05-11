/**
 * `~/.rackrc` configuration file management.
 *
 * Handles reading, writing, and resolving the CLI configuration.
 * Each registry namespace maps to a URL and optional authentication headers.
 *
 * @example
 * ```ts
 * import { rackrc } from './rackrc.js'
 * const config = await rackrc.load()
 * const registry = await rackrc.getRegistry('@rack')
 * ```
 */

import path from 'node:path'
import { homedir } from 'node:os'
import { ConfigError } from './utils/errors.js'
import { isString, isPlainObject } from 'lodash-es'
import { readJSON, writeJSON, pathExists } from './infra/fs.js'
import { DEFAULT_NAMESPACE, DEFAULT_REGISTRY_URL } from '../constants.js'

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Registry entry as a full object with URL, headers, and optional token.
 */
export interface RegistryEntryObject {
  url: string
  token?: string
  headers?: Record<string, string>
}

/**
 * Registry entry — either a plain URL string or a detailed object.
 */
export type RegistryEntry = string | RegistryEntryObject

/**
 * User configuration stored in `~/.rackrc`.
 */
export interface RackConfig {
  registries: Record<string, RegistryEntry>
}

/**
 * Resolved registry with URL and optional headers ready for HTTP requests.
 */
export interface ResolvedRegistry {
  url: string
  headers?: Record<string, string>
}

/** Absolute path to the configuration file. */
const CONFIG_PATH = path.join(homedir(), '.rackrc')

// ─── Internal ────────────────────────────────────────────────────────────────

/**
 * Build the default configuration with only the `@rack` namespace.
 *
 * @returns Default configuration
 */
function getDefaultConfig(): RackConfig {
  return {
    registries: {
      [DEFAULT_NAMESPACE]: DEFAULT_REGISTRY_URL
    }
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Get the path to the configuration file.
 *
 * @returns Absolute path to `~/.rackrc`
 */
function getConfigPath(): string {
  return CONFIG_PATH
}

/**
 * Load configuration from `~/.rackrc`.
 *
 * Returns the default configuration when the file is missing
 * or its content is not a valid JSON object.
 *
 * @returns Parsed configuration
 * @throws {ConfigError} If the file exists but is not valid JSON
 */
async function load(): Promise<RackConfig> {
  try {
    const defaultConfig = getDefaultConfig()

    if (!(await pathExists(CONFIG_PATH))) {
      return defaultConfig
    }

    const raw = await readJSON<RackConfig>(CONFIG_PATH)
    const registries =
      isPlainObject(raw) && isPlainObject(raw.registries) ? raw.registries : {}

    return {
      registries: {
        ...defaultConfig.registries,
        ...registries
      }
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ConfigError(
        `Configuration file is not valid JSON: ${CONFIG_PATH}`
      )
    }
    throw error
  }
}

/**
 * Save configuration to `~/.rackrc`.
 *
 * @param config - Configuration to persist
 */
async function save(config: RackConfig): Promise<void> {
  await writeJSON(CONFIG_PATH, config, 2)
}

/**
 * Resolve a registry entry into a normalized URL and headers object.
 *
 * String entries are treated as bare URLs. Object entries may
 * include a token that is converted to a Bearer header.
 *
 * @param entry - Raw registry entry (string URL or config object)
 * @returns Normalized URL and headers
 */
function resolveRegistry(entry: RegistryEntry): ResolvedRegistry {
  if (isString(entry)) {
    return { url: entry }
  }

  const headers: Record<string, string> = { ...entry.headers }

  if (entry.token) {
    headers['Authorization'] = `Bearer ${entry.token}`
  }

  const result: ResolvedRegistry = { url: entry.url }
  if (Object.keys(headers).length > 0) {
    result.headers = headers
  }
  return result
}

/**
 * Get registry configuration for a specific namespace.
 *
 * Falls back to the default namespace when the requested
 * namespace is not configured.
 *
 * @param namespace - Registry namespace (e.g. `@rack`)
 * @returns Resolved registry
 */
async function getRegistry(namespace: string): Promise<ResolvedRegistry> {
  const config = await load()
  const entry =
    config.registries[namespace] ?? config.registries[DEFAULT_NAMESPACE]
  return resolveRegistry(entry)
}

/**
 * Set registry configuration for a namespace.
 *
 * @param namespace - Registry namespace
 * @param entry - Registry entry to store
 */
async function setRegistry(
  namespace: string,
  entry: RegistryEntry
): Promise<void> {
  const config = await load()
  config.registries[namespace] = entry
  await save(config)
}

/**
 * Remove registry configuration for a namespace.
 *
 * @param namespace - Registry namespace to remove
 * @returns `true` if removed, `false` if the namespace did not exist
 */
async function removeRegistry(namespace: string): Promise<boolean> {
  const config = await load()

  if (config.registries[namespace]) {
    delete config.registries[namespace]
    await save(config)
    return true
  }

  return false
}

/**
 * List all configured registries.
 *
 * @returns Map of namespace to resolved registry
 */
async function listRegistries(): Promise<Record<string, ResolvedRegistry>> {
  const config = await load()
  const result: Record<string, ResolvedRegistry> = {}

  for (const [namespace, entry] of Object.entries(config.registries)) {
    result[namespace] = resolveRegistry(entry)
  }

  return result
}

// ─── Namespace Export ────────────────────────────────────────────────────────

export const rackrc = {
  load,
  save,
  getRegistry,
  setRegistry,
  getConfigPath,
  removeRegistry,
  listRegistries,
  resolveRegistry
}
