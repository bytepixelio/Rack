/**
 * Recursive registry dependency resolution.
 *
 * Given a set of initial registry items, fetches all transitive
 * `registryDependencies` and returns the complete deduplicated list.
 * Identifiers are canonicalized via {@link canonicalizeIdentifier} so that
 * different forms (e.g. `utils`, `@rack/utils`) are deduplicated.
 */

import { registry } from '../registry/client.js'
import { canonicalizeIdentifier } from '../registry/identifier.js'

import type { Logger } from '../infra/logger.js'
import type { Language } from '../registry/types.js'
import type { ResolvedRegistryItem } from './types.js'

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Recursively resolve all registry dependencies.
 *
 * Starting from `items`, walks each item's `registryDependencies`,
 * fetching and resolving each one. New entries added to the Map
 * are automatically visited by the iterator, so transitive
 * dependencies are resolved without an explicit queue.
 *
 * @param items - Initial registry items
 * @param language - Language variant for fetching dependencies
 * @param logger - Logger instance
 * @returns All registries including transitive dependencies (deduplicated)
 *
 * @example
 * ```ts
 * // If A depends on B, and B depends on C:
 * const all = await resolveRegistryDependencies([A], 'ts', logger)
 * // Returns: [A, B, C]
 * ```
 */
export async function resolveRegistryDependencies(
  items: ResolvedRegistryItem[],
  language: Language | undefined,
  logger: Logger
): Promise<ResolvedRegistryItem[]> {
  const resolved = new Map(
    items.map((i) => [canonicalizeIdentifier(i.identifier), i])
  )

  for (const current of resolved.values()) {
    for (const depId of current.registryDependencies ?? []) {
      if (resolved.has(canonicalizeIdentifier(depId))) continue

      logger.debug(`Fetching dependency: ${depId}`)
      resolved.set(
        canonicalizeIdentifier(depId),
        await registry.fetchItem(depId, { language })
      )
    }
  }

  return Array.from(resolved.values())
}
