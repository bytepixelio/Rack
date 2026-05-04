/**
 * Registry conflict detection and validation.
 *
 * Checks whether any registry in a set declares a conflict with another
 * registry in the same set. Version suffixes are stripped before comparison.
 *
 * @example
 * ```ts
 * validateNoConflicts(items) // throws ConflictError if conflicts found
 * ```
 */

import { ConflictError } from '../utils/errors.js'

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
 * @param items - Registry items to validate
 * @throws {ConflictError} If any registry conflicts with another
 */
export function validateNoConflicts(items: ResolvedRegistryItem[]): void {
  const nameToId = new Map(
    items.map((item) => [stripVersion(item.identifier), item.identifier])
  )
  const conflicts: ConflictInfo[] = []

  for (const item of items) {
    for (const conflict of item.conflicts ?? []) {
      const match = nameToId.get(stripVersion(conflict))
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
 * Strip version suffix from an identifier for conflict comparison.
 *
 * @example
 * ```ts
 * stripVersion('@rack/vue@2.0.0') // => '@rack/vue'
 * stripVersion('@rack/vue')       // => '@rack/vue'
 * ```
 */
function stripVersion(identifier: string): string {
  const parts = identifier.split('@')
  return parts.slice(0, 2).join('@')
}
