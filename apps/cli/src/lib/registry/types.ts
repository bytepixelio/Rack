/**
 * Registry schema types — models the JSON served by the registry server.
 *
 * Maps to `packages/storage/schema/registry-item.json` and `preset.json`.
 */

// ─── Language ────────────────────────────────────────────────────────────────

/**
 * Language variant for registry items (`js` or `ts`).
 */
export type Language = 'js' | 'ts'

// ─── Merge Strategy ──────────────────────────────────────────────────────────

/**
 * Merge strategy configuration for a registry file.
 */
export interface MergeStrategyConfig {
  script?: string
  /** Plugin script path. Only used when `type: 'custom'`. */
  type: 'builtin' | 'custom'
  /** Builtin strategy name. Only used when `type: 'builtin'`. */
  strategy?: 'json' | 'ignore' | 'env' | 'overwrite'
}

// ─── Registry File ───────────────────────────────────────────────────────────

/**
 * File definition in a registry item.
 *
 * Describes a file that should be created or modified when installing the registry.
 * Files can be provided as template paths or inline content.
 */
export interface RegistryFile {
  /** File type (e.g. `'registry:config'`, `'registry:asset'`). */
  type: string
  /** Source path (template file on the registry server). */
  path?: string
  /** Target path in the project. */
  target: string
  /** Inline content (used instead of `path` for small files). */
  content?: string
  /** Whether the file should be executable (`chmod +x`). */
  executable?: boolean
  /** Merge strategy configuration. */
  mergeStrategy?: MergeStrategyConfig
}

// ─── Registry Item ───────────────────────────────────────────────────────────

/**
 * Registry item descriptor returned from the registry server.
 *
 * Matches the schema defined in `packages/storage/schema/registry-item.json`.
 */
export interface RegistryItem {
  name: string
  type: string
  tags?: string[]
  author?: string
  version: string
  priority: number
  $schema?: string
  license?: string
  namespace: string
  homepage?: string
  repository?: string
  conflicts?: string[]
  description?: string
  files?: RegistryFile[]
  defaultLanguage?: 'js' | 'ts'
  registryDependencies?: string[]
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  languages?: Record<string, Partial<RegistryItem>>
}

// ─── Preset ──────────────────────────────────────────────────────────────────

/**
 * Preset definition — bundles multiple registries for easy installation.
 */
export interface Preset {
  name: string
  version: string
  $schema?: string
  registries: string[]
  description?: string
}

// ─── Resolved Registry Item ─────────────────────────────────────────────────

/**
 * Registry item with provenance metadata: the original identifier used to
 * fetch it and the URL where it lives. Pipeline phases work with these.
 */
export interface ResolvedRegistryItem extends RegistryItem {
  /** Original identifier used to fetch this registry. */
  identifier: string
  /** Full URL of the registry.json file (used for resolving external file paths). */
  registryUrl: string
}
