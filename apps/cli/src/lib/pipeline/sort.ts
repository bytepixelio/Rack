/**
 * Pipeline item sorting — dependency-aware topological sort with priority.
 *
 * Items are sorted by dependency level first (dependencies before dependents),
 * then by priority within the same level (lower number = higher precedence).
 *
 * @example
 * ```ts
 * const sorted = sortItems(items)
 * ```
 */

import { CircularDependencyError } from '../utils/errors.js'

import type { ResolvedRegistryItem } from './types.js'

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Sort items by dependency order, then by priority within the same level.
 *
 * Dependencies are always installed before dependents, regardless of priority.
 * Items at the same dependency level are sorted by `item.priority` (ascending).
 *
 * @param items - Registry items to sort
 * @returns Sorted copy of items
 * @throws {CircularDependencyError} If a circular dependency is detected
 *
 * @example
 * ```ts
 * // A (priority 2) depends on B (priority 4)
 * // Result: B → A (dependency order wins over priority)
 * const sorted = sortItems([A, B])
 * ```
 */
export function sortItems(
  items: ResolvedRegistryItem[]
): ResolvedRegistryItem[] {
  if (items.length === 0) return []

  const levels = computeLevels(items)

  return [...items].sort((a, b) => {
    const levelDiff = levels.get(a.identifier)! - levels.get(b.identifier)!
    return levelDiff !== 0 ? levelDiff : a.priority - b.priority
  })
}

// ─── Internal ────────────────────────────────────────────────────────────────

/**
 * Build a simplified dependency graph: identifier → dependency identifiers.
 *
 * @param items - Registry items
 * @returns Map of identifier → dependency identifier list
 */
function buildGraph(items: ResolvedRegistryItem[]): Map<string, string[]> {
  return new Map(
    items.map((item) => [item.identifier, item.registryDependencies ?? []])
  )
}

/**
 * Compute dependency level for each item.
 *
 * Level 0 = no dependencies, level N+1 = depends on something at level N.
 *
 * @param items - Registry items
 * @returns Map of identifier → dependency level
 * @throws {CircularDependencyError} If a circular dependency is detected
 */
function computeLevels(items: ResolvedRegistryItem[]): Map<string, number> {
  const graph = buildGraph(items)
  const levels = new Map<string, number>()
  const visiting = new Set<string>()
  const path: string[] = []

  function visit(identifier: string): number {
    if (visiting.has(identifier)) {
      throw new CircularDependencyError(
        `Circular dependency detected: ${[...path, identifier].join(' -> ')}`,
        [...path, identifier]
      )
    }

    const cached = levels.get(identifier)
    if (cached !== undefined) return cached

    const deps = graph.get(identifier)
    if (!deps || deps.length === 0) {
      levels.set(identifier, 0)
      return 0
    }

    visiting.add(identifier)
    path.push(identifier)

    const level = Math.max(...deps.map(visit)) + 1

    path.pop()
    visiting.delete(identifier)
    levels.set(identifier, level)
    return level
  }

  for (const item of items) {
    if (!levels.has(item.identifier)) {
      visit(item.identifier)
    }
  }

  return levels
}
