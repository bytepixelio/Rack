/**
 * Recursive registry dependency resolution.
 *
 * Given a set of initial registry items, fetches all transitive
 * `registryDependencies` and returns the complete deduplicated list.
 * Identifiers are canonicalized via {@link canonicalizeIdentifier} so that
 * different forms (e.g. `utils`, `@rack/utils`) are deduplicated.
 */

import { AppError } from '../utils/errors.js'
import { registry } from '../registry/client.js'
import { canonicalizeIdentifier } from '../registry/identifier.js'

import type { Logger } from '../infra/logger.js'
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
 * Each dep is fetched with its parent's `resolvedLanguage` so an
 * explicit `:js`/`:ts` choice on a root genuinely flows downstream —
 * `fetchItem` still lets a dep override via its own suffix (e.g. a JS
 * registry that pins a TS-only sub-dep), but the default tracks the
 * parent instead of getting reset to the project language at every hop.
 *
 * Transitive dependencies whose canonical id is in `installed` are
 * skipped — they're neither fetched nor included in the result, since
 * their files and package.json entries are already on disk from a
 * previous install. Conflict detection still sees them via the caller's
 * separate `fetchItems(installedRegistries)` path, so reciprocal
 * conflicts remain enforceable.
 *
 * `registryDependencies` does not support `@version` or `:language`
 * suffixes (enforced by `packages/storage/schema/registry-item.json`).
 * Self-hosted registries that bypass the Registry Server's upload
 * validation could still emit suffixed entries; surface those as
 * `VALIDATION_ERROR` instead of half-honoring the unsupported syntax.
 *
 * @param items     - Initial registry items (always included in the result)
 * @param logger    - Logger instance
 * @param installed - Identifiers already installed in the project; their
 *                    transitive appearance is suppressed. Defaults to empty.
 * @returns All registries including transitive dependencies (deduplicated),
 *          excluding any whose canonical id appears in `installed`.
 * @throws {AppError} With code `VALIDATION_ERROR` if a `registryDependencies`
 *          entry includes an `@version` or `:language` suffix.
 *
 * @example
 * ```ts
 * // If A depends on B, and B depends on C:
 * const all = await resolveRegistryDependencies([A], logger)
 * // → [A, B, C]
 *
 * // If A is already installed and we're adding B (which depends on A):
 * const all = await resolveRegistryDependencies([B], logger, ['A'])
 * // → [B]  (A is skipped — not re-fetched, not re-applied)
 * ```
 */
export async function resolveRegistryDependencies(
  items: ResolvedRegistryItem[],
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
      assertUnpinnedDependency(depId, current.identifier)

      const key = canonicalizeIdentifier(depId)
      if (resolved.has(key)) continue

      if (satisfied.has(key)) {
        logger.debug(`Skipping already-installed dependency: ${depId}`)
        continue
      }

      logger.debug(`Fetching dependency: ${depId}`)
      resolved.set(
        key,
        await registry.fetchItem(depId, { language: current.resolvedLanguage })
      )
    }
  }

  return Array.from(resolved.values())
}

// ─── Internal ───────────────────────────────────────────────────────────────

/**
 * Reject `registryDependencies` entries that pin a version or language.
 *
 * The registry-item schema (`packages/storage/schema/registry-item.json`)
 * limits `registryDependencies` to bare `@namespace/path` or shorthand
 * `path` — pinning is not part of the protocol. A self-hosted registry
 * that skips Server-side validation could still emit `@rack/x@1.0.0`;
 * partially honoring it would let the runtime drift from the documented
 * protocol, so refuse the input outright.
 *
 * @param depId       - Dependency identifier from `registryDependencies`
 * @param parentId    - Parent registry identifier (for error context)
 * @throws {AppError} With code `VALIDATION_ERROR` when `depId` contains
 *                    `@version` or `:language`.
 */
function assertUnpinnedDependency(depId: string, parentId: string): void {
  // Namespace prefix `@ns/...` is fine; only an `@` *after* the
  // namespace introduces a version pin. Strip the leading `@<ns>/`
  // before scanning so shorthand `foo` and full `@ns/foo` are checked
  // identically.
  const tail = depId.startsWith('@')
    ? depId.slice(1).split('/').slice(1).join('/')
    : depId
  if (tail.includes('@') || tail.includes(':')) {
    throw new AppError(
      'VALIDATION_ERROR',
      `registryDependencies entry "${depId}" (declared by ${parentId}) includes a version ` +
        'or language suffix, which is not supported. ' +
        'Remove the @version / :language suffix and republish the registry.'
    )
  }
}
