/**
 * URL path parsing and filesystem path resolution utilities.
 *
 * Handles the `/registries/@ns/:path+` URL scheme and provides
 * safe filesystem path resolution with traversal protection.
 */

import { join, normalize } from 'path'
import { SEMVER_PATTERN } from '../constants.js'

import type { ParsedRegistryPath } from '../types.js'

/**
 * Type of registry resource identified from the URL path.
 *
 * - `versioned`  — A specific version: `/registries/@rack/node/1.0.0`
 * - `latest`     — Latest version: `/registries/@rack/node`
 * - `versions`   — Version list: `/registries/@rack/node/versions`
 * - `file`       — Template file: `/registries/@rack/node/1.0.0/files/index.ts`
 */
export type RegistryResourceType = 'versioned' | 'latest' | 'versions' | 'file'

/** Result of parsing a `/registries/...` URL path. */
export interface ParsedRegistryUrl {
  /** Type of resource being requested */
  type: RegistryResourceType

  /** Parsed path components */
  path: ParsedRegistryPath
}

// ─── URL Parsing ─────────────────────────────────────────────────────────────

/**
 * Find the index of the first SemVer segment, skipping the namespace at index 0.
 *
 * @param parts - URL path segments (first element is the namespace)
 * @returns Index of the SemVer segment, or -1 if not found
 *
 * @example
 * findVersionIndex(['@rack', 'node', '1.0.0', 'files', 'a.ts']) // → 2
 * findVersionIndex(['@rack', 'node', 'versions'])                // → -1
 * findVersionIndex(['@rack', 'node'])                            // → -1
 */
function findVersionIndex(parts: string[]): number {
  for (let i = 1; i < parts.length; i++) {
    if (SEMVER_PATTERN.test(parts[i])) return i
  }
  return -1
}

/**
 * Parse a `/registries/...` URL path into structured components.
 *
 * @param urlPath - URL path after the `/registries` prefix
 * @returns Parsed result, or `null` if the path is invalid
 *
 * @example
 * // Version list
 * parseRegistryUrl('/@rack/node/versions')
 * // → { type: 'versions', path: { namespace: '@rack', segments: ['node'] } }
 *
 * // Latest registry
 * parseRegistryUrl('/@rack/runtimes/node')
 * // → { type: 'latest', path: { namespace: '@rack', segments: ['runtimes', 'node'] } }
 *
 * // Specific version
 * parseRegistryUrl('/@rack/node/1.0.0')
 * // → { type: 'versioned', path: { namespace: '@rack', segments: ['node'], version: '1.0.0' } }
 *
 * // Template file
 * parseRegistryUrl('/@rack/node/1.0.0/files/src/index.ts')
 * // → { type: 'file', path: { namespace: '@rack', segments: ['node'], version: '1.0.0', filePath: 'src/index.ts' } }
 *
 * // Invalid
 * parseRegistryUrl('/node')        // → null (missing namespace)
 * parseRegistryUrl('/@rack')       // → null (missing name)
 * parseRegistryUrl('/rack/node')   // → null (namespace must start with @)
 */
export function parseRegistryUrl(urlPath: string): ParsedRegistryUrl | null {
  const parts = urlPath.split('/').filter(Boolean)

  // Need at least @namespace + name
  if (parts.length < 2) return null

  const [namespace, ...rest] = parts
  if (!namespace.startsWith('@')) return null

  const versionIndex = findVersionIndex(parts)
  const hasVersion = versionIndex !== -1

  // /@ns/name/versions → version list
  if (!hasVersion && rest.at(-1) === 'versions' && rest.length >= 2) {
    return {
      type: 'versions',
      path: { namespace, segments: rest.slice(0, -1) }
    }
  }

  // /@ns/name → latest registry (no version, no "versions" suffix)
  if (!hasVersion) {
    return {
      type: 'latest',
      path: { namespace, segments: rest }
    }
  }

  const segments = parts.slice(1, versionIndex)
  if (segments.length === 0) return null

  const version = parts[versionIndex]
  const afterVersion = parts.slice(versionIndex + 1)

  // /@ns/name/1.0.0 → specific version (nothing after version)
  if (afterVersion.length === 0) {
    return {
      type: 'versioned',
      path: { namespace, segments, version }
    }
  }

  // /@ns/name/1.0.0/files/... → template file
  if (afterVersion[0] === 'files' && afterVersion.length >= 2) {
    return {
      type: 'file',
      path: {
        namespace,
        segments,
        version,
        filePath: afterVersion.slice(1).join('/')
      }
    }
  }

  // Something after version but not /files/... → invalid
  return null
}

// ─── Filesystem Path Resolution ──────────────────────────────────────────────

/**
 * Assert that a resolved path stays within the storage root.
 *
 * @param resolved - Normalized absolute path
 * @param storageRoot - Storage root directory
 * @throws {Error} When path traversal is detected
 */
function assertWithinRoot(resolved: string, storageRoot: string): void {
  if (!resolved.startsWith(normalize(storageRoot))) {
    throw new Error('Path traversal detected')
  }
}

/**
 * Resolve a versioned registry path to a filesystem path.
 *
 * @param storageRoot - Storage root directory
 * @param namespace - Registry namespace
 * @param segments - Name segments
 * @param version - SemVer version string
 * @returns Absolute path to registry.json
 * @throws {Error} When path traversal is detected
 *
 * @example
 * resolveRegistryPath('/storage', '@rack', ['node'], '1.0.0')
 * // → '/storage/@rack/node/1.0.0/registry.json'
 *
 * resolveRegistryPath('/storage', '@rack', ['runtimes', 'node'], '2.0.0')
 * // → '/storage/@rack/runtimes/node/2.0.0/registry.json'
 */
export function resolveRegistryPath(
  storageRoot: string,
  namespace: string,
  segments: string[],
  version: string
): string {
  const resolved = normalize(
    join(storageRoot, namespace, ...segments, version, 'registry.json')
  )
  assertWithinRoot(resolved, storageRoot)
  return resolved
}

/**
 * Resolve a template file path within a versioned registry.
 *
 * @param storageRoot - Storage root directory
 * @param namespace - Registry namespace
 * @param segments - Name segments
 * @param version - SemVer version string
 * @param filePath - Relative file path within the version directory
 * @returns Absolute path to the template file
 * @throws {Error} When path traversal is detected
 *
 * @example
 * resolveFilePath('/storage', '@rack', ['node'], '1.0.0', 'src/index.ts')
 * // → '/storage/@rack/node/1.0.0/src/index.ts'
 *
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
  const resolved = normalize(
    join(storageRoot, namespace, ...segments, version, filePath)
  )
  assertWithinRoot(resolved, storageRoot)
  return resolved
}

/**
 * Resolve a versions.json path for a registry.
 *
 * @param storageRoot - Storage root directory
 * @param namespace - Registry namespace
 * @param segments - Name segments
 * @returns Absolute path to versions.json
 * @throws {Error} When path traversal is detected
 *
 * @example
 * resolveVersionsPath('/storage', '@rack', ['node'])
 * // → '/storage/@rack/node/versions.json'
 *
 * resolveVersionsPath('/storage', '@rack', ['runtimes', 'node'])
 * // → '/storage/@rack/runtimes/node/versions.json'
 */
export function resolveVersionsPath(
  storageRoot: string,
  namespace: string,
  segments: string[]
): string {
  const resolved = normalize(
    join(storageRoot, namespace, ...segments, 'versions.json')
  )
  assertWithinRoot(resolved, storageRoot)
  return resolved
}

/**
 * Resolve a preset.json path.
 *
 * @param storageRoot - Storage root directory
 * @param name - Preset name
 * @returns Absolute path to preset.json
 * @throws {Error} When path traversal is detected
 *
 * @example
 * resolvePresetPath('/storage', 'vue-fullstack')
 * // → '/storage/presets/vue-fullstack/preset.json'
 */
export function resolvePresetPath(storageRoot: string, name: string): string {
  const resolved = normalize(join(storageRoot, 'presets', name, 'preset.json'))
  assertWithinRoot(resolved, storageRoot)
  return resolved
}

/**
 * Resolve a JSON Schema file path.
 *
 * @param schemaDir - Directory holding the schema files
 * @param fileName - Schema file name
 * @returns Absolute path to the schema file
 * @throws {Error} When path traversal is detected
 *
 * @example
 * resolveSchemaPath('/app/schema', 'registry-item.json')
 * // → '/app/schema/registry-item.json'
 */
export function resolveSchemaPath(schemaDir: string, fileName: string): string {
  const resolved = normalize(join(schemaDir, fileName))
  assertWithinRoot(resolved, schemaDir)
  return resolved
}
