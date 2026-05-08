/**
 * Derive a registry's storage segments from its registry.json.
 *
 * Resolution order:
 *
 * 1. Explicit `path` field — split on `/`. The last segment must equal
 *    `name`. Used to override the type-derived placement when a
 *    registry's semantic role differs from its storage location.
 * 2. {@link CATEGORY_BY_TYPE}`[type]` exists → `[category, name]`.
 * 3. Fallback `[name]` (flat layout, used by registries with a `type`
 *    that isn't in the category map).
 */

import { CATEGORY_BY_TYPE } from './constants.js'

import type { RegistryManifestPathInput } from './types.js'

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Resolve segments for a registry being installed.
 *
 * @param input    - Subset of registry.json carrying `name`, optional `type`, optional `path`
 * @returns Path segments under the namespace
 * @throws {Error} When `path` is set but its last segment differs from `name`
 *
 * @example
 * deriveSegments({ name: 'husky', type: 'registry:quality' })
 * // → ['quality', 'husky']
 *
 * @example
 * deriveSegments({ name: 'foo', type: 'registry:custom-tool' })
 * // → ['foo']
 *
 * @example
 * deriveSegments({ name: 'husky', path: 'legacy/husky' })
 * // → ['legacy', 'husky']
 */
export function deriveSegments(input: RegistryManifestPathInput): string[] {
  if (input.path) {
    const segments = input.path.split('/').filter(Boolean)
    if (segments.length === 0 || segments[segments.length - 1] !== input.name) {
      throw new Error(`path "${input.path}" must end with name "${input.name}"`)
    }
    return segments
  }

  if (input.type && CATEGORY_BY_TYPE[input.type]) {
    return [CATEGORY_BY_TYPE[input.type], input.name]
  }

  return [input.name]
}
