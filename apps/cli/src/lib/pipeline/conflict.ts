/**
 * Registry conflict detection and validation.
 *
 * Checks whether any registry in a set declares a conflict with another
 * registry in the same set. Identifiers are normalized to `namespace/path`
 * via {@link parseNamespace} so that different forms of the same registry
 * (e.g. `vue`, `@rack/vue`, `vue@1.0.0`) are treated as equivalent.
 *
 * @example
 * ```ts
 * validateNoConflicts(items) // throws ConflictError if conflicts found
 * ```
 */

import { ConflictError } from '../utils/errors.js'
import { parseNamespace } from '../registry/identifier.js'

import type { ResolvedRegistryItem } from './types.js'

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Conflict information between two registries.
 */
export interface ConflictInfo {
  /** Registry identifier that conflicts. */
  identifier: string
  /** Registry identifier it conflicts with. */
  conflictsWith: string
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Validate that no conflicts exist among registry items.
 *
 * @param items              - Registry items to validate
 * @param installedIdentifiers - Identifiers already in rack.json (used as
 *                              lightweight fallback when full fetch fails)
 * @throws {ConflictError} If any registry conflicts with another
 */
export function validateNoConflicts(
  items: ResolvedRegistryItem[],
  installedIdentifiers: string[] = []
): void {
  const nameToId = new Map(
    items.map((item) => [canonicalize(item.identifier), item.identifier])
  )

  for (const id of installedIdentifiers) {
    const key = canonicalize(id)
    if (!nameToId.has(key)) nameToId.set(key, id)
  }

  const conflicts: ConflictInfo[] = []

  for (const item of items) {
    for (const conflict of item.conflicts ?? []) {
      const match = nameToId.get(canonicalize(conflict))
      if (match && match !== item.identifier) {
        conflicts.push({ identifier: item.identifier, conflictsWith: match })
      }
    }
  }

  if (conflicts.length === 0) return

  const messages = conflicts.map(
    (c) => `  - ${c.identifier} conflicts with ${c.conflictsWith}`
  )
  throw new ConflictError(
    `Conflicting registries detected:\n${messages.join('\n')}`,
    conflicts
  )
}

// ─── Internal ────────────────────────────────────────────────────────────────

/**
 * Normalize an identifier to `namespace/path` for comparison.
 * Strips version, language, and resolves the default namespace.
 *
 * @example
 * ```ts
 * canonicalize('@rack/vue@2.0.0')        // → '@rack/vue'
 * canonicalize('frameworks/vue@1.0.0')   // → '@rack/frameworks/vue'
 * canonicalize('vue')                    // → '@rack/vue'
 * ```
 */
function canonicalize(identifier: string): string {
  const { namespace, path } = parseNamespace(identifier)
  return `${namespace}/${path}`
}
