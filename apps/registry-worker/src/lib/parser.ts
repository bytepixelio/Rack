/**
 * Registry URL parsing.
 *
 * Mirrors the logic in registry-server `src/lib/path.ts`.
 */

import { SEMVER_RE } from './constants.js'

export type RegistryResourceType = 'versioned' | 'latest' | 'versions' | 'file'

export interface ParsedRegistryUrl {
  version?: string
  namespace: string
  filePath?: string
  segments: string[]
  type: RegistryResourceType
}

/**
 * Parse a `/registries/...` URL path into structured components.
 *
 * @param urlPath - URL path after the `/registries` prefix
 * @returns Parsed result, or `null` if the path is invalid
 */
export function parseRegistryUrl(urlPath: string): ParsedRegistryUrl | null {
  const parts = urlPath.split('/').filter(Boolean)
  if (parts.length < 2) return null

  const [namespace, ...rest] = parts
  if (!namespace.startsWith('@')) return null

  // Find version segment index (skip namespace at 0)
  let versionIndex = -1
  for (let i = 1; i < parts.length; i++) {
    if (SEMVER_RE.test(parts[i])) {
      versionIndex = i
      break
    }
  }

  const hasVersion = versionIndex !== -1

  // /@ns/name/versions → version list
  if (!hasVersion && rest.at(-1) === 'versions' && rest.length >= 2) {
    return { type: 'versions', namespace, segments: rest.slice(0, -1) }
  }

  // /@ns/name → latest
  if (!hasVersion) {
    return { type: 'latest', namespace, segments: rest }
  }

  const segments = parts.slice(1, versionIndex)
  if (segments.length === 0) return null

  const version = parts[versionIndex]
  const afterVersion = parts.slice(versionIndex + 1)

  // /@ns/name/1.0.0 → versioned
  if (afterVersion.length === 0) {
    return { type: 'versioned', namespace, segments, version }
  }

  // /@ns/name/1.0.0/files/... → file
  if (afterVersion[0] === 'files' && afterVersion.length >= 2) {
    return {
      version,
      segments,
      namespace,
      type: 'file',
      filePath: afterVersion.slice(1).join('/')
    }
  }

  return null
}
