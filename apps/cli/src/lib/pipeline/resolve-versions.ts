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

/** A version entry tagged with the field (`dependencies` or `devDependencies`) it came from. */
interface FieldedVersionEntry extends VersionEntry {
  field: DepField
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
  // Merge dependencies + devDependencies into a single per-package map so
  // that a package declared as a runtime dep by one registry and a dev dep
  // by another participates in the same conflict resolution and ends up
  // written to a single field — without this, package.json would carry the
  // package twice with potentially different versions.
  const versionsByPackage = collectVersions(items)
  const dependencies: Record<string, string> = {}
  const devDependencies: Record<string, string> = {}
  const conflicts: VersionConflict[] = []

  for (const [pkg, versions] of versionsByPackage) {
    const resolution =
      versions.length === 1
        ? { version: versions[0].version, strategy: 'same' as const }
        : resolveVersionConflict(versions)

    // Runtime placement wins: if any registry treated this package as a
    // runtime dep, the resolved entry lands in `dependencies`.
    const targetField: DepField = versions.some(
      (v) => v.field === 'dependencies'
    )
      ? 'dependencies'
      : 'devDependencies'

    if (targetField === 'dependencies') dependencies[pkg] = resolution.version
    else devDependencies[pkg] = resolution.version

    if (resolution.strategy !== 'same') {
      conflicts.push({
        package: pkg,
        versions,
        resolvedVersion: resolution.version,
        strategy: resolution.strategy
      })
    }
  }

  return { dependencies, devDependencies, conflicts }
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
 * Collect all declared versions of each package across both
 * `dependencies` and `devDependencies` fields.
 *
 * Each entry remembers which field it came from so the caller can
 * decide final placement (`dependencies` wins over `devDependencies`
 * when a package appears in both).
 *
 * @param items - Registry items
 * @returns Map of package name → versions declared by each registry
 */
function collectVersions(
  items: ResolvedRegistryItem[]
): Map<string, FieldedVersionEntry[]> {
  const map = new Map<string, FieldedVersionEntry[]>()
  const fields: DepField[] = ['dependencies', 'devDependencies']

  for (const item of items) {
    for (const field of fields) {
      for (const [pkg, version] of Object.entries(item[field] ?? {})) {
        const entry: FieldedVersionEntry = {
          field,
          version,
          registry: item.identifier,
          priority: item.priority
        }
        const existing = map.get(pkg)
        if (existing) existing.push(entry)
        else map.set(pkg, [entry])
      }
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
  const allVersions = versions.map((v) => v.version)
  const ranges = allVersions.filter((r) => semver.validRange(r))
  if (ranges.length !== allVersions.length) return null

  const candidates: { range: string; min: semver.SemVer }[] = []
  for (const r of ranges) {
    const min = semver.minVersion(r)
    if (min) candidates.push({ range: r, min })
  }
  if (candidates.length === 0) return null

  const best = candidates.reduce((a, b) => (semver.gt(b.min, a.min) ? b : a))

  return ranges.every((r) => semver.satisfies(best.min, r)) ? best.range : null
}
