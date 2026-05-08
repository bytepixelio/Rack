/**
 * Shared types for the registry protocol.
 *
 * `RegistryLocator` is the single representation of "where a registry
 * lives". Every read endpoint, every install path, every versions.json
 * regen consumes a locator — there is no second `(namespace, name,
 * version)` shape that pretends single-segment is the universe.
 */

// ─── Public API ──────────────────────────────────────────────────────

/** Kind of resource a `/registries/...` URL addresses. */
export type RegistryResourceType = 'versions' | 'latest' | 'versioned' | 'file'

/** Storage location of a single registry (resource). */
export interface RegistryLocator {
  /** SemVer string — only on `versioned` and `file` resources */
  version?: string
  /** Template-relative path inside the version dir — only on `file` resources */
  filePath?: string
  /** Namespace including the leading `@`, e.g. `@rack` */
  namespace: string
  /** Path segments under the namespace, e.g. `['quality', 'husky']` */
  segments: string[]
}

/** Result of {@link parseRegistryUrl}. */
export interface ParsedRegistryUrl {
  locator: RegistryLocator
  type: RegistryResourceType
}

/** Subset of registry.json consulted by {@link deriveSegments}. */
export interface RegistryManifestPathInput {
  /** Leaf identifier, kebab-case */
  name: string
  /** Module-level type, e.g. `registry:quality` */
  type?: string
  /** Optional explicit segment path (e.g. `quality/husky`) — overrides `type` */
  path?: string
}
