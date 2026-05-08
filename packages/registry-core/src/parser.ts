/**
 * Parse `/registries/...` URL paths into typed locators.
 *
 * Recognized shapes (after stripping the `/registries` prefix):
 * - `/@ns/<segs>/versions`               → `versions`
 * - `/@ns/<segs>`                        → `latest`
 * - `/@ns/<segs>/<semver>`               → `versioned`
 * - `/@ns/<segs>/<semver>/files/<path>`  → `file`
 *
 * Returns `null` for anything malformed (missing namespace, namespace
 * without `@`, no name segment, suffix after version that isn't `files/`).
 */

import { SEMVER_PATTERN } from './constants.js'

import type { ParsedRegistryUrl } from './types.js'

// ─── Internal ────────────────────────────────────────────────────────

/** First index ≥ 1 whose element matches SemVer; -1 when none does. */
function findVersionIndex(parts: string[]): number {
  for (let i = 1; i < parts.length; i++) {
    if (SEMVER_PATTERN.test(parts[i])) return i
  }
  return -1
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
  if (!namespace.startsWith('@')) return null

  const versionIndex = findVersionIndex(parts)
  const hasVersion = versionIndex !== -1

  if (!hasVersion && rest.at(-1) === 'versions' && rest.length >= 2) {
    return {
      type: 'versions',
      locator: { namespace, segments: rest.slice(0, -1) }
    }
  }

  if (!hasVersion) {
    return {
      type: 'latest',
      locator: { namespace, segments: rest }
    }
  }

  const segments = parts.slice(1, versionIndex)
  if (segments.length === 0) return null

  const version = parts[versionIndex]
  const afterVersion = parts.slice(versionIndex + 1)

  if (afterVersion.length === 0) {
    return {
      type: 'versioned',
      locator: { namespace, segments, version }
    }
  }

  if (afterVersion[0] === 'files' && afterVersion.length >= 2) {
    return {
      type: 'file',
      locator: {
        namespace,
        segments,
        version,
        filePath: afterVersion.slice(1).join('/')
      }
    }
  }

  return null
}
