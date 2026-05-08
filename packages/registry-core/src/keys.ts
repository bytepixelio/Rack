/**
 * Build R2 keys / forward-slash storage paths from a {@link RegistryLocator}.
 *
 * Returned strings have no leading slash. Server consumers join them
 * with `storageRoot` to get an absolute filesystem path; worker
 * consumers pass them directly to `bucket.get`. Both backends observe
 * the same string for the same locator — that is the point.
 */

import type { RegistryLocator } from './types.js'

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Key for a registry directory (no version, no file).
 *
 * @param locator - `{ namespace, segments }`
 * @returns `<namespace>/<segments-joined-by-slash>`
 *
 * @example
 * buildRegistryDirKey({ namespace: '@rack', segments: ['quality', 'husky'] })
 * // → '@rack/quality/husky'
 */
export function buildRegistryDirKey(
  locator: Pick<RegistryLocator, 'namespace' | 'segments'>
): string {
  return `${locator.namespace}/${locator.segments.join('/')}`
}

/**
 * Key for a registry's `versions.json`.
 *
 * @param locator - `{ namespace, segments }`
 * @returns `<dir>/versions.json`
 *
 * @example
 * buildVersionsKey({ namespace: '@rack', segments: ['quality', 'husky'] })
 * // → '@rack/quality/husky/versions.json'
 */
export function buildVersionsKey(
  locator: Pick<RegistryLocator, 'namespace' | 'segments'>
): string {
  return `${buildRegistryDirKey(locator)}/versions.json`
}

/**
 * Key for a versioned `registry.json`.
 *
 * @param locator - `{ namespace, segments, version }`
 * @returns `<dir>/<version>/registry.json`
 *
 * @example
 * buildRegistryKey({
 *   namespace: '@rack',
 *   segments: ['quality', 'husky'],
 *   version: '1.0.0'
 * })
 * // → '@rack/quality/husky/1.0.0/registry.json'
 */
export function buildRegistryKey(
  locator: Pick<RegistryLocator, 'namespace' | 'segments'> & { version: string }
): string {
  return `${buildRegistryDirKey(locator)}/${locator.version}/registry.json`
}

/**
 * Key for a template file inside a registry version.
 *
 * @param locator - `{ namespace, segments, version, filePath }`
 * @returns `<dir>/<version>/<filePath>`
 *
 * @example
 * buildFileKey({
 *   namespace: '@rack',
 *   segments: ['quality', 'husky'],
 *   version: '1.0.0',
 *   filePath: 'templates/.husky/commit-msg'
 * })
 * // → '@rack/quality/husky/1.0.0/templates/.husky/commit-msg'
 */
export function buildFileKey(
  locator: Pick<RegistryLocator, 'namespace' | 'segments'> & {
    version: string
    filePath: string
  }
): string {
  return `${buildRegistryDirKey(locator)}/${locator.version}/${locator.filePath}`
}
