/**
 * Parse `/registries/...` URL paths into typed locators.
 *
 * Recognized shapes (after stripping the `/registries` prefix):
 * - `/@ns/<segs>/versions`               → `versions`
 * - `/@ns/<segs>`                        → `latest`
 * - `/@ns/<segs>/<semver>`               → `versioned`
 * - `/@ns/<segs>/<semver>/files/<path>`  → `file`
 *
 * Returns `null` for anything malformed: missing namespace, namespace
 * not matching `NAMESPACE_PATTERN`, any path segment not matching
 * `PATH_SEGMENT_PATTERN`, traversal-style file paths, or suffix after
 * the version that isn't `files/<path>`. Callers are expected to map
 * `null` to HTTP 400 `INVALID_PATH`; "resource not found" is a
 * different code path (404) reserved for valid locators that don't
 * resolve to bytes in storage.
 */

import { validateFilePath } from './file-path.js'
import {
  SEMVER_PATTERN,
  NAMESPACE_PATTERN,
  PATH_SEGMENT_PATTERN
} from './constants.js'

import type { ParsedRegistryUrl } from './types.js'

// ─── Internal ────────────────────────────────────────────────────────

/** First index ≥ 1 whose element matches SemVer; -1 when none does. */
function findVersionIndex(parts: string[]): number {
  for (let i = 1; i < parts.length; i++) {
    if (SEMVER_PATTERN.test(parts[i])) return i
  }
  return -1
}

/** True iff every entry passes the kebab-case segment pattern. */
function segmentsValid(segments: string[]): boolean {
  return segments.every((s) => PATH_SEGMENT_PATTERN.test(s))
}

/** True iff `filePath` passes the shared `validateFilePath` rules. */
function filePathValid(filePath: string): boolean {
  try {
    validateFilePath(filePath)
    return true
  } catch {
    return false
  }
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Parse a `/registries/...` URL into a typed `{type, locator}` pair.
 *
 * @param urlPath - URL path including the leading `/`
 * @returns `{type, locator}` on success, `null` on malformed input
 *
 * @example
 * parseRegistryUrl('/@rack/quality/husky/1.0.0')
 * // → { type: 'versioned', locator: { namespace: '@rack', segments: ['quality','husky'], version: '1.0.0' } }
 *
 * @example
 * parseRegistryUrl('/@rack/node/versions')
 * // → { type: 'versions', locator: { namespace: '@rack', segments: ['node'] } }
 *
 * @example
 * parseRegistryUrl('/@rack/runtimes/node/1.0.0/files/src/index.ts')
 * // → { type: 'file', locator: { namespace: '@rack', segments: ['runtimes','node'], version: '1.0.0', filePath: 'src/index.ts' } }
 */
export function parseRegistryUrl(urlPath: string): ParsedRegistryUrl | null {
  const parts = urlPath.split('/').filter(Boolean)
  if (parts.length < 2) return null

  const [namespace, ...rest] = parts
  if (!NAMESPACE_PATTERN.test(namespace)) return null

  const versionIndex = findVersionIndex(parts)
  const hasVersion = versionIndex !== -1

  if (!hasVersion && rest.at(-1) === 'versions' && rest.length >= 2) {
    const segments = rest.slice(0, -1)
    if (!segmentsValid(segments)) return null
    return { type: 'versions', locator: { namespace, segments } }
  }

  if (!hasVersion) {
    if (!segmentsValid(rest)) return null
    return { type: 'latest', locator: { namespace, segments: rest } }
  }

  const segments = parts.slice(1, versionIndex)
  if (segments.length === 0 || !segmentsValid(segments)) return null

  const version = parts[versionIndex]
  const afterVersion = parts.slice(versionIndex + 1)

  if (afterVersion.length === 0) {
    return { type: 'versioned', locator: { namespace, segments, version } }
  }

  if (afterVersion[0] === 'files' && afterVersion.length >= 2) {
    const filePath = afterVersion.slice(1).join('/')
    if (!filePathValid(filePath)) return null
    return {
      type: 'file',
      locator: { namespace, segments, version, filePath }
    }
  }

  return null
}
