/**
 * Registry client — fetch registry items, presets, and template files.
 *
 * Namespace export following the same pattern as `rackrc.*` and `pkg.*`.
 * HTTP client is a module-scoped singleton; callers handle their own logging.
 *
 * @example
 * ```ts
 * const item = await registry.fetchItem('@rack/vue@1.0.0', { language: 'ts' })
 * const preset = await registry.fetchPreset('@presets/tutorial-project')
 * const content = await registry.fetchFile(item.registryUrl, './templates/app.vue')
 * ```
 */

import { merge } from 'lodash-es'
import { rackrc } from '../rackrc.js'
import { HttpClient } from '../infra/http.js'
import { validateFilePath } from '@rack/registry-core'
import { AppError, HttpError, RegistryNotFoundError } from '../utils/errors.js'
import { parseNamespace, type ParsedNamespace } from './identifier.js'

import type { Logger } from '../infra/logger.js'
import type {
  Preset,
  Language,
  RegistryFile,
  RegistryItem,
  ResolvedRegistryItem
} from './types.js'

// ─── Infra ───────────────────────────────────────────────────────────────────

const http = new HttpClient()

// ─── Types ───────────────────────────────────────────────────────────────────

/** Options for {@link fetchItem}. */
export interface FetchItemOptions {
  /** Language variant to apply (optional; falls back to `item.defaultLanguage`, then `'ts'`). */
  language?: Language
}

/** Options for {@link fetchItems}. */
export interface FetchItemsOptions {
  /** Logger for warning on fetch failures. */
  logger?: Logger
  /** Language variant to apply. */
  language?: Language
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetch a registry item by identifier.
 *
 * When `language` is provided, the item's `languages[lang]` block is
 * deep-merged into the base item before returning.
 *
 * @param identifier - Registry identifier (e.g. `'node-ts'`, `'@rack/vue@1.0.0'`)
 * @param options - Fetch options (language)
 * @returns The registry item with provenance (`identifier`, `registryUrl`) and language overrides applied
 * @throws {RegistryNotFoundError} If the registry or namespace is not configured
 */
async function fetchItem(
  identifier: string,
  options: FetchItemOptions = {}
): Promise<ResolvedRegistryItem> {
  const parsed = parseNamespace(identifier)

  const resolved = await rackrc.getRegistry(parsed.namespace)
  if (!resolved) {
    throw new RegistryNotFoundError(
      `No registry configured for namespace: ${parsed.namespace}`,
      identifier
    )
  }

  const url = buildRegistryUrl(parsed, resolved.url)

  try {
    const { data: item } = await http.get<RegistryItem>(url, {
      headers: resolved.headers
    })

    if (!item.name || !item.version || !item.type) {
      throw new Error('Invalid registry item: missing required fields')
    }

    // When the identifier omits a version, the URL is unversioned.
    // Template files still need a versioned base path, so append item.version.
    const registryUrl = parsed.version ? url : `${url}/${item.version}`

    const canonicalId = `${parsed.namespace}/${parsed.path}`

    return {
      ...applyLanguageOverrides(item, options.language ?? parsed.language),
      identifier: canonicalId,
      registryUrl
    }
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      throw new RegistryNotFoundError(
        `Registry not found: ${identifier}`,
        identifier
      )
    }
    throw error
  }
}

/**
 * Fetch a preset by identifier.
 *
 * @param identifier - Preset identifier (e.g. `'@presets/tutorial-project'`)
 * @returns The preset containing a list of registry identifiers
 * @throws {RegistryNotFoundError} If the preset or namespace is not configured
 */
async function fetchPreset(identifier: string): Promise<Preset> {
  const parsed = parseNamespace(identifier)

  if (parsed.path.includes('/')) {
    throw new AppError(
      'INVALID_PRESET',
      `Preset name must be a single segment, got: ${parsed.path}`
    )
  }

  if (parsed.version || parsed.language) {
    throw new AppError(
      'INVALID_PRESET',
      'Presets do not support @version or :language suffixes'
    )
  }

  const resolved = await rackrc.getRegistry(parsed.namespace)
  if (!resolved) {
    throw new RegistryNotFoundError(
      `No registry configured for namespace: ${parsed.namespace}`,
      identifier
    )
  }

  const root = stripTrailingSlash(resolved.url)
  const url = `${root}/presets/${parsed.path}`

  try {
    const { data: preset } = await http.get<Preset>(url, {
      headers: resolved.headers
    })

    if (!preset.registries || !Array.isArray(preset.registries)) {
      throw new Error('Invalid preset: missing registries array')
    }

    return preset
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      throw new RegistryNotFoundError(
        `Preset not found: ${identifier}`,
        identifier
      )
    }
    throw error
  }
}

/**
 * Fetch a template file as text from the registry server.
 *
 * @param registryUrl - Registry item URL (e.g. `https://.../@rack/vue/1.0.0`)
 * @param filePath - Relative path to the file (e.g. `'./templates/app.vue'`)
 * @returns File content as a string
 */
async function fetchFile(
  registryUrl: string,
  filePath: string
): Promise<string> {
  const fileUrl = resolveFileUrl(registryUrl, filePath)

  try {
    const headers = await resolveAuthHeaders(registryUrl)
    // Use getBuffer to bypass axios auto-parsing of application/json responses;
    // template files (incl. *.json) must surface as raw text for merge strategies.
    const buf = await http.getBuffer(fileUrl, { headers })
    return buf.toString('utf-8')
  } catch (error) {
    throw rethrowAsFileNotFound(error, filePath, fileUrl)
  }
}

/**
 * Fetch a template file as a binary Buffer from the registry server.
 *
 * @param registryUrl - Registry item URL (e.g. `https://.../@rack/vue/1.0.0`)
 * @param filePath - Relative path to the file
 * @returns Raw file content as Buffer
 */
async function fetchBinaryFile(
  registryUrl: string,
  filePath: string
): Promise<Buffer> {
  const fileUrl = resolveFileUrl(registryUrl, filePath)

  try {
    const headers = await resolveAuthHeaders(registryUrl)
    return await http.getBuffer(fileUrl, { headers })
  } catch (error) {
    throw rethrowAsFileNotFound(error, filePath, fileUrl)
  }
}

/**
 * Fetch multiple registry items by identifier, skipping failures.
 *
 * Uses `Promise.allSettled` to fetch all items in parallel.
 * Failed fetches are logged as warnings and excluded from the result.
 *
 * @param ids - Registry identifiers to fetch
 * @param options - Fetch options (language, logger)
 * @returns Successfully fetched and resolved registry items
 */
async function fetchItems(
  ids: string[],
  options: FetchItemsOptions = {}
): Promise<ResolvedRegistryItem[]> {
  if (ids.length === 0) return []

  const results = await Promise.allSettled(
    ids.map((id) => fetchItem(id, { language: options.language }))
  )

  return results.flatMap((result, i) => {
    if (result.status === 'fulfilled') return [result.value]
    options.logger?.warn(`Could not fetch registry ${ids[i]}. Skipping.`)
    return []
  })
}

export const registry = {
  fetchFile,
  fetchItem,
  fetchItems,
  fetchPreset,
  fetchBinaryFile
}

/** Type of the {@link registry} namespace — useful for typing mocks in tests. */
export type Registry = typeof registry

// ─── Internal ────────────────────────────────────────────────────────────────

/** Strip trailing slashes from a URL. */
const stripTrailingSlash = (url: string): string => url.replace(/\/+$/, '')

/**
 * Build the URL for a registry item.
 *
 * @param parsed - Parsed namespace components
 * @param baseUrl - Base registry server URL
 * @returns Full URL to the registry item
 *
 * @example
 * ```ts
 * buildRegistryUrl(
 *   { namespace: '@rack', path: 'runtimes/node', version: '1.2.3' },
 *   'https://registry.rackjs.com'
 * )
 * // => 'https://registry.rackjs.com/registries/@rack/runtimes/node/1.2.3'
 * ```
 */
function buildRegistryUrl(parsed: ParsedNamespace, baseUrl: string): string {
  const root = stripTrailingSlash(baseUrl)
  const segments = [parsed.namespace, ...parsed.path.split('/')]

  if (parsed.version) segments.push(parsed.version)

  return `${root}/registries/${segments.join('/')}`
}

/**
 * Resolve a relative file path against a registry item URL.
 *
 * Files are served under `/files/` on the registry server; this helper
 * injects that segment so callers can work with bare relative paths.
 * Rejects absolute paths, `.`/`..` segments, and encoded dot segments
 * to prevent URL normalization from escaping the `/files/` scope.
 *
 * @param registryUrl - Registry item URL (e.g. `https://.../@rack/vue/1.0.0`)
 * @param filePath - Relative path (e.g. `'./templates/app.vue'`)
 * @returns Absolute file URL
 * @throws {Error} If the path contains traversal segments or is absolute
 */
function resolveFileUrl(registryUrl: string, filePath: string): string {
  const { normalized } = validateFilePath(filePath)
  const base = stripTrailingSlash(registryUrl)
  return `${base}/files/${normalized}`
}

/**
 * Extract the namespace from a registry URL and return its auth headers.
 *
 * @param registryUrl - Full registry URL containing the namespace segment
 * @returns Headers for the namespace, or `undefined` if not extractable
 */
async function resolveAuthHeaders(
  registryUrl: string
): Promise<Record<string, string> | undefined> {
  const match = registryUrl.match(/\/(@[^/]+)\//)
  if (!match) return undefined

  const resolved = await rackrc.getRegistry(match[1])
  return resolved?.headers
}

/**
 * Translate a 404 {@link HttpError} into a descriptive template-not-found error.
 * Non-404 errors are rethrown as-is.
 */
function rethrowAsFileNotFound(
  error: unknown,
  filePath: string,
  fileUrl: string
): never {
  if (error instanceof HttpError && error.status === 404) {
    throw new Error(
      `Template file not found: ${filePath} (resolved to ${fileUrl})`
    )
  }
  throw error
}

/**
 * Apply language-specific overrides to a registry item.
 *
 * Picks the language variant (`language` → `item.defaultLanguage` → `'ts'`),
 * then deep-merges the matching `languages[lang]` block into the base item.
 * `files` are merged by `target`: language files with a matching target
 * replace the base entry; others are appended.
 */
function applyLanguageOverrides(
  item: RegistryItem,
  language?: Language
): RegistryItem {
  const lang = language ?? item.defaultLanguage ?? 'ts'
  const overrides = item.languages?.[lang]
  if (!overrides) return item

  const merged = { ...item }

  if (overrides.dependencies) {
    merged.dependencies = merge({}, item.dependencies, overrides.dependencies)
  }
  if (overrides.devDependencies) {
    merged.devDependencies = merge({}, item.devDependencies, overrides.devDependencies)
  }
  if (overrides.files?.length) {
    merged.files = mergeFilesByTarget(item.files ?? [], overrides.files)
  }

  return merged
}

/**
 * Merge two file lists by `target`.
 *
 * Base files whose target matches a language file are replaced in-place;
 * language files with no matching base entry are appended.
 *
 * @param base - Common files from the top-level `files` array
 * @param overrides - Language-specific files
 */
function mergeFilesByTarget(
  base: RegistryFile[],
  overrides: RegistryFile[]
): RegistryFile[] {
  const overrideMap = new Map(overrides.map(f => [f.target, f]))
  const seen = new Set<string>()

  const result = base.map(f => {
    if (overrideMap.has(f.target)) {
      seen.add(f.target)
      return overrideMap.get(f.target)!
    }
    return f
  })

  for (const f of overrides) {
    if (!seen.has(f.target)) result.push(f)
  }

  return result
}
