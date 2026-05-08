/**
 * Filesystem path resolution with traversal protection.
 *
 * URL parsing and protocol-level key building live in `@rack/registry-core`
 * — shared with the worker. This module only adds the server-specific
 * concern of joining a key under `storageRoot` and proving the result
 * stays inside the root.
 */

import { join, normalize } from 'node:path'
import {
  buildFileKey,
  buildRegistryKey,
  buildVersionsKey
} from '@rack/registry-core'

// ─── Internal ────────────────────────────────────────────────────────

/** Throw when a normalized path escapes its root. */
function assertWithinRoot(resolved: string, storageRoot: string): void {
  if (!resolved.startsWith(normalize(storageRoot))) {
    throw new Error('Path traversal detected')
  }
}

/** Join a forward-slash key under `storageRoot`, normalize, and guard. */
function resolveUnder(storageRoot: string, key: string): string {
  const resolved = normalize(join(storageRoot, key))
  assertWithinRoot(resolved, storageRoot)
  return resolved
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Resolve a versioned `registry.json` to an absolute fs path.
 *
 * @param storageRoot - Storage root directory
 * @param namespace   - Registry namespace
 * @param segments    - Path segments under the namespace
 * @param version     - SemVer version
 * @returns Absolute path to `registry.json`
 *
 * @example
 * resolveRegistryPath('/storage', '@rack', ['runtimes', 'node'], '2.0.0')
 * // → '/storage/@rack/runtimes/node/2.0.0/registry.json'
 */
export function resolveRegistryPath(
  storageRoot: string,
  namespace: string,
  segments: string[],
  version: string
): string {
  return resolveUnder(
    storageRoot,
    buildRegistryKey({ namespace, segments, version })
  )
}

/**
 * Resolve a template file inside a versioned registry.
 *
 * @param storageRoot - Storage root directory
 * @param namespace   - Registry namespace
 * @param segments    - Path segments under the namespace
 * @param version     - SemVer version
 * @param filePath    - Template-relative path
 * @returns Absolute path to the template file
 *
 * @example
 * resolveFilePath('/storage', '@rack', ['vue'], '2.0.0', 'templates/App.vue')
 * // → '/storage/@rack/vue/2.0.0/templates/App.vue'
 */
export function resolveFilePath(
  storageRoot: string,
  namespace: string,
  segments: string[],
  version: string,
  filePath: string
): string {
  return resolveUnder(
    storageRoot,
    buildFileKey({ namespace, segments, version, filePath })
  )
}

/**
 * Resolve a registry's `versions.json` to an absolute fs path.
 *
 * @param storageRoot - Storage root directory
 * @param namespace   - Registry namespace
 * @param segments    - Path segments under the namespace
 * @returns Absolute path to `versions.json`
 *
 * @example
 * resolveVersionsPath('/storage', '@rack', ['runtimes', 'node'])
 * // → '/storage/@rack/runtimes/node/versions.json'
 */
export function resolveVersionsPath(
  storageRoot: string,
  namespace: string,
  segments: string[]
): string {
  return resolveUnder(storageRoot, buildVersionsKey({ namespace, segments }))
}

/**
 * Resolve a `presets/<name>/preset.json` to an absolute fs path.
 *
 * @param storageRoot - Storage root directory
 * @param name        - Preset name
 * @returns Absolute path to `preset.json`
 *
 * @example
 * resolvePresetPath('/storage', 'vue-fullstack')
 * // → '/storage/presets/vue-fullstack/preset.json'
 */
export function resolvePresetPath(storageRoot: string, name: string): string {
  return resolveUnder(storageRoot, `presets/${name}/preset.json`)
}

/**
 * Resolve a JSON Schema file under a schema dir.
 *
 * @param schemaDir - Directory holding the schema files
 * @param fileName  - Schema file name
 * @returns Absolute path to the schema file
 *
 * @example
 * resolveSchemaPath('/app/schema', 'registry-item.json')
 * // → '/app/schema/registry-item.json'
 */
export function resolveSchemaPath(schemaDir: string, fileName: string): string {
  return resolveUnder(schemaDir, fileName)
}

// Re-export the shared parser so callers don't dual-import.
export { parseRegistryUrl } from '@rack/registry-core'
export type {
  ParsedRegistryUrl,
  RegistryResourceType
} from '@rack/registry-core'
