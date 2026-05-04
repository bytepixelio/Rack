/**
 * Fetch a template — either a preset (resolves to multiple registries)
 * or a single registry identifier.
 *
 * Init-only: the add command operates on a single registry directly via
 * `registry.fetchItem()` and does not need this preset-vs-single branch.
 *
 * @example
 * ```ts
 * const items = await fetchTemplate('@presets/vue', { language: 'ts', logger })
 * ```
 */

import { registry } from '../../registry/client.js'
import { isPreset } from '../../registry/identifier.js'

import type { Logger } from '../../infra/logger.js'
import type { Language } from '../../registry/types.js'
import type { ResolvedRegistryItem } from '../../pipeline/types.js'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FetchTemplateOptions {
  logger: Logger
  language?: Language
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Fetch a template. If it identifies a preset, fetch the preset's
 * registries; otherwise fetch the single registry.
 *
 * @param template - Template identifier (preset or registry)
 * @param options - Language variant and logger
 * @returns Resolved registry items (with `identifier` + `registryUrl` set)
 */
export async function fetchTemplate(
  template: string,
  options: FetchTemplateOptions
): Promise<ResolvedRegistryItem[]> {
  const { language, logger } = options
  const ids = await resolveTemplateIds(template, logger)

  const items: ResolvedRegistryItem[] = []
  for (const id of ids) {
    items.push(await registry.fetchItem(id, { language }))
  }
  return items
}

// ─── Internal ───────────────────────────────────────────────────────────────

/**
 * Expand a template identifier to the list of registry ids it represents.
 *
 * @param template - Preset or single registry identifier
 * @param logger - Logger instance
 * @returns Registry ids to fetch
 */
async function resolveTemplateIds(
  template: string,
  logger: Logger
): Promise<string[]> {
  if (!isPreset(template)) {
    logger.info(`Fetching registry: ${template}`)
    return [template]
  }
  logger.info(`Fetching preset: ${template}`)
  const preset = await registry.fetchPreset(template)
  return preset.registries
}
