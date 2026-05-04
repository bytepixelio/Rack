/**
 * Resolve npm dependency version conflicts across multiple registries.
 *
 * Each registry item declares its own `dependencies` / `devDependencies`.
 * When the same package appears in more than one registry with different
 * versions, this module picks a single version per package using three
 * strategies (in order): same → compatible (newest semver-satisfying
 * range) → priority (lowest priority number wins).
 *
 * @example
 * ```ts
 * const result = resolveDependencies(items)
 * // { dependencies, devDependencies, conflicts, warnings }
 * ```
 */

import semver from 'semver'
import { minBy } from 'lodash-es'

import type { Logger } from '../infra/logger.js'
import type { ResolvedRegistryItem } from './types.js'

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * A single package version declared by a registry.
 */
export interface VersionEntry {
  version: string
  registry: string
  priority: number
}

/**
 * Information about a resolved version conflict.
 */
export interface VersionConflict {
  package: string
  resolvedVersion: string
  versions: VersionEntry[]
  strategy: ResolutionStrategy
}

/**
 * Result of dependency resolution.
 */
export interface DependencyResolutionResult {
  conflicts: VersionConflict[]
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}

type ResolutionStrategy = 'same' | 'compatible' | 'priority'

type DepField = 'dependencies' | 'devDependencies'

interface Resolution {
  version: string
  strategy: ResolutionStrategy
}

interface ResolvedSet {
  conflicts: VersionConflict[]
  resolved: Record<string, string>
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Resolve npm dependency version conflicts across multiple registries.
 *
 * Resolution strategies (applied in order):
 * 1. **same** — all versions identical, keep that version
 * 2. **compatible** — versions all satisfy a common semver range, choose the newest
 * 3. **priority** — incompatible, choose version from registry with lowest priority number
 *
 * @param items - Registry items
 * @returns Resolved dependencies with conflict information
 */
export function resolveDependencies(
  items: ResolvedRegistryItem[]
): DependencyResolutionResult {
  const deps = resolveSet(items, 'dependencies')
  const devDeps = resolveSet(items, 'devDependencies')

  return {
    dependencies: deps.resolved,
    devDependencies: devDeps.resolved,
    conflicts: [...deps.conflicts, ...devDeps.conflicts]
  }
}

/**
 * Log resolved version conflicts.
 *
 * Emits one warn-level summary line plus one debug line per conflict.
 * No-op when there are no conflicts.
 *
 * @param conflicts - Conflicts produced by {@link resolveDependencies}
 * @param logger - Logger instance
 */
export function logConflicts(
  conflicts: VersionConflict[],
  logger: Logger
): void {
  if (conflicts.length === 0) return
  logger.warn(`Resolved ${conflicts.length} dependency version conflict(s)`)
  for (const c of conflicts) {
    const detail = c.versions
      .map((v) => `${v.registry}@${v.version}`)
      .join(', ')
    logger.debug(
      `  ${c.package}: ${detail} → ${c.resolvedVersion} (${c.strategy})`
    )
  }
}

// ─── Internal ───────────────────────────────────────────────────────────────

/**
 * Resolve a single dependency field (`dependencies` or `devDependencies`).
 *
 * @param items - Registry items
 * @param field - Which dependency field to process
 * @returns Resolved versions, recorded conflicts, and warning messages
 */
function resolveSet(
  items: ResolvedRegistryItem[],
  field: DepField
): ResolvedSet {
  const versionsByPackage = collectVersions(items, field)
  const resolved: Record<string, string> = {}
  const conflicts: VersionConflict[] = []

  for (const [pkg, versions] of versionsByPackage) {
    if (versions.length === 1) {
      resolved[pkg] = versions[0].version
      continue
    }

    const resolution = resolveVersionConflict(versions)
    resolved[pkg] = resolution.version

    if (resolution.strategy !== 'same') {
      conflicts.push({
        package: pkg,
        versions,
        resolvedVersion: resolution.version,
        strategy: resolution.strategy
      })
    }
  }

  return { resolved, conflicts }
}

/**
 * Collect all declared versions of each package across the given items.
 *
 * @param items - Registry items
 * @param field - Which dependency field to read
 * @returns Map of package name → versions declared by each registry
 */
function collectVersions(
  items: ResolvedRegistryItem[],
  field: DepField
): Map<string, VersionEntry[]> {
  const map = new Map<string, VersionEntry[]>()
  for (const item of items) {
    for (const [pkg, version] of Object.entries(item[field] ?? {})) {
      const entry: VersionEntry = {
        version,
        registry: item.identifier,
        priority: item.priority
      }
      const existing = map.get(pkg)
      if (existing) existing.push(entry)
      else map.set(pkg, [entry])
    }
  }
  return map
}

/**
 * Pick a single winning version from multiple conflicting entries.
 *
 * @param versions - Conflicting versions for the same package
 * @returns Resolved version and the strategy used to pick it
 */
function resolveVersionConflict(versions: VersionEntry[]): Resolution {
  if (versions.every((v) => v.version === versions[0].version)) {
    return { version: versions[0].version, strategy: 'same' }
  }

  const compatible = findCompatibleVersion(versions)
  if (compatible) {
    return { version: compatible, strategy: 'compatible' }
  }

  return {
    version: minBy(versions, 'priority')!.version,
    strategy: 'priority'
  }
}

/**
 * Find a range that is compatible with all input ranges.
 *
 * The candidate with the highest minVersion is the only possible winner:
 * any compatible version must be ≥ every range's minimum, so if the max
 * min fails to satisfy all ranges, no version does. We pick the max-min
 * candidate and verify it satisfies the original valid ranges.
 *
 * @param versions - Conflicting version entries
 * @returns Compatible range, or `null` if no compatible range exists
 */
function findCompatibleVersion(versions: VersionEntry[]): string | null {
  const ranges = versions
    .map((v) => v.version)
    .filter((r) => semver.validRange(r))
  if (ranges.length === 0) return null

  const candidates: { range: string; min: semver.SemVer }[] = []
  for (const r of ranges) {
    const min = semver.minVersion(r)
    if (min) candidates.push({ range: r, min })
  }
  if (candidates.length === 0) return null

  const best = candidates.reduce((a, b) => (semver.gt(b.min, a.min) ? b : a))

  return ranges.every((r) => semver.satisfies(best.min, r)) ? best.range : null
}
