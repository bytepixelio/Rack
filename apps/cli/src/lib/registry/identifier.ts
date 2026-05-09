/**
 * Registry identifier parsing — `@namespace/path@version:language`.
 *
 * Pure string-parsing utilities with zero I/O. Used by {@link client}
 * to resolve identifiers into URLs and by commands to detect presets.
 *
 * @example
 * ```ts
 * parseNamespace('@rack/runtimes/node@1.0.0:ts')
 * // { namespace: '@rack', path: 'runtimes/node', version: '1.0.0', language: 'ts' }
 * ```
 */

import { SEMVER_PATTERN } from '@rack/registry-core'
import { DEFAULT_NAMESPACE } from '../../constants.js'
import { InvalidNamespaceError } from '../utils/errors.js'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Parsed namespace information from a registry identifier.
 */
export interface ParsedNamespace {
  /** Registry path after the namespace (e.g., `'runtimes/node'`). */
  path: string
  /** Optional version specifier (e.g., `'1.0.0'`). */
  version?: string
  /** The namespace (e.g., `'@rack'`, `'@mycompany'`). */
  namespace: string
  /** Optional language variant. */
  language?: 'ts' | 'js'
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Parse a registry identifier into its components.
 *
 * @param identifier - The registry identifier to parse
 * @returns Parsed namespace information
 * @throws {InvalidNamespaceError} If the identifier is invalid
 *
 * @example
 * ```ts
 * parseNamespace('node-ts')
 * // { namespace: '@rack', path: 'node-ts' }
 *
 * parseNamespace('@rack/runtimes/node')
 * // { namespace: '@rack', path: 'runtimes/node' }
 *
 * parseNamespace('nextjs@14.0.0')
 * // { namespace: '@rack', path: 'nextjs', version: '14.0.0' }
 *
 * parseNamespace('@mycompany/runtime/node@1.0.0:ts')
 * // { namespace: '@mycompany', path: 'runtime/node', version: '1.0.0', language: 'ts' }
 * ```
 */
export function parseNamespace(identifier: string): ParsedNamespace {
  const trimmed = identifier?.trim()
  if (!trimmed) {
    throw new InvalidNamespaceError('Identifier cannot be empty', identifier)
  }

  const { language, rest } = extractLanguage(trimmed)
  const { namespace, remaining } = extractNamespaceAndPath(rest)
  const { version, namePath } = extractVersion(remaining)
  const path = validateAndNormalizePath(namePath)

  return {
    path,
    namespace,
    ...(version && { version }),
    ...(language && { language })
  }
}

/**
 * Check if an identifier refers to a preset.
 *
 * @param identifier - Registry or preset identifier
 * @returns `true` if the identifier uses the `@presets/` namespace
 *
 * @example
 * ```ts
 * isPreset('@presets/vue')        // true
 * isPreset('@rack/tailwindcss')   // false
 * ```
 */
export function isPreset(identifier: string): boolean {
  return identifier.startsWith('@presets/')
}

// ─── Internal ────────────────────────────────────────────────────────────────

/**
 * Extract language variant from identifier suffix (`:ts` or `:js`).
 */
/**
 * Extract language variant from identifier suffix (`:ts` or `:js`).
 *
 * @example
 * ```ts
 * extractLanguage('@rack/vue@1.0.0:ts')
 * // { language: 'ts', rest: '@rack/vue@1.0.0' }
 *
 * extractLanguage('@rack/vue')
 * // { language: undefined, rest: '@rack/vue' }
 * ```
 */
function extractLanguage(identifier: string): {
  language: 'ts' | 'js' | undefined
  rest: string
} {
  const match = identifier.match(/:([tj]s)$/)
  if (!match) return { language: undefined, rest: identifier }

  return {
    language: match[1] as 'ts' | 'js',
    rest: identifier.slice(0, -3)
  }
}

/**
 * Extract namespace and remaining path from identifier.
 * Normalizes namespace to lowercase.
 *
 * @example
 * ```ts
 * extractNamespaceAndPath('@rack/runtimes/node', ...)
 * // { namespace: '@rack', remaining: 'runtimes/node' }
 *
 * extractNamespaceAndPath('vue', ...)
 * // { namespace: '@rack', remaining: 'vue' }  (default namespace)
 * ```
 */
function extractNamespaceAndPath(identifier: string): {
  namespace: string
  remaining: string
} {
  if (!identifier.startsWith('@')) {
    return { namespace: DEFAULT_NAMESPACE, remaining: identifier }
  }

  const slashIndex = identifier.indexOf('/')
  if (slashIndex === -1) {
    throw new InvalidNamespaceError(
      'Namespace must be followed by / and a registry path',
      identifier
    )
  }

  const namespace = identifier.slice(0, slashIndex).toLowerCase()
  const remaining = identifier.slice(slashIndex + 1)

  if (!/^@[a-z0-9](?:[a-z0-9-_]*[a-z0-9])?$/.test(namespace)) {
    throw new InvalidNamespaceError(
      'Namespace must match format @[a-z0-9](?:[a-z0-9-_]*[a-z0-9])?',
      identifier
    )
  }

  return { namespace, remaining }
}

/**
 * Extract version from identifier suffix (`@version`).
 */
function extractVersion(identifier: string): {
  version: string | undefined
  namePath: string
} {
  const versionIndex = identifier.lastIndexOf('@')
  if (versionIndex === -1) {
    return { version: undefined, namePath: identifier }
  }

  const version = identifier.slice(versionIndex + 1)
  const namePath = identifier.slice(0, versionIndex)

  if (!version) {
    throw new InvalidNamespaceError('Version cannot be empty', identifier)
  }

  if (!SEMVER_PATTERN.test(version)) {
    throw new InvalidNamespaceError(
      'Version must be a valid semver (e.g. 1.0.0)',
      identifier
    )
  }

  return { version, namePath }
}

/**
 * Validate and normalize registry path segments to lowercase.
 */
function validateAndNormalizePath(path: string): string {
  const segments = path.split('/')

  if (!segments[0]) {
    throw new InvalidNamespaceError('Name cannot be empty', path)
  }

  if (segments.some((s) => !s.trim())) {
    throw new InvalidNamespaceError(
      'Registry path must not contain empty segments',
      path
    )
  }

  return segments
    .map((segment) => {
      const normalized = segment.trim().toLowerCase()
      if (!/^[a-z0-9-]+$/.test(normalized)) {
        throw new InvalidNamespaceError(
          'Each path segment must match [a-z0-9-]+',
          path
        )
      }
      return normalized
    })
    .join('/')
}
