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
 * Transitive dependencies whose canonical id is in `installed` are
 * skipped — they're neither fetched nor included in the result, since
 * their files and package.json entries are already on disk from a
 * previous install. Conflict detection still sees them via the caller's
 * separate `fetchItems(installedRegistries)` path, so reciprocal
 * conflicts remain enforceable.
 *
 * @param items     - Initial registry items (always included in the result)
 * @param language  - Language variant for fetching dependencies
 * @param logger    - Logger instance
 * @param installed - Identifiers already installed in the project; their
 *                    transitive appearance is suppressed. Defaults to empty.
 * @returns All registries including transitive dependencies (deduplicated),
 *          excluding any whose canonical id appears in `installed`.
 *
 * @example
 * ```ts
 * // If A depends on B, and B depends on C:
 * const all = await resolveRegistryDependencies([A], 'ts', logger)
 * // → [A, B, C]
 *
 * // If A is already installed and we're adding B (which depends on A):
 * const all = await resolveRegistryDependencies([B], 'ts', logger, ['A'])
 * // → [B]  (A is skipped — not re-fetched, not re-applied)
 * ```
 */
export async function resolveRegistryDependencies(
  items: ResolvedRegistryItem[],
  language: Language | undefined,
  logger: Logger,
  installed: Iterable<string> = []
): Promise<ResolvedRegistryItem[]> {
  const satisfied = new Set<string>()
  for (const id of installed) satisfied.add(canonicalizeIdentifier(id))

  const resolved = new Map(
    items.map((i) => [canonicalizeIdentifier(i.identifier), i])
  )

  for (const current of resolved.values()) {
    for (const depId of current.registryDependencies ?? []) {
      const key = canonicalizeIdentifier(depId)
      if (resolved.has(key)) continue
      if (satisfied.has(key)) {
        logger.debug(`Skipping already-installed dependency: ${depId}`)
        continue
      }

      logger.debug(`Fetching dependency: ${depId}`)
      resolved.set(key, await registry.fetchItem(depId, { language }))
    }
  }

  return Array.from(resolved.values())
}
