/**
 * Custom merge plugin loader — download, load, and execute user-defined
 * merge scripts from local or remote registries.
 *
 * Supports both ESM and CommonJS plugins. Remote plugins are downloaded
 * to a temporary directory and the directory is removed after execution
 * (success or failure). Remote plugins must be self-contained single
 * files: only the entry script referenced by `mergeStrategy.script` is
 * fetched, so relative imports inside the script (`import './utils.js'`)
 * will fail to resolve. Local plugin paths are validated against
 * traversal attacks.
 *
 * @example
 * ```ts
 * const result = await executePlugin(
 *   { type: 'custom', script: 'plugins/merge.js' },
 *   'https://registry.example.com/@rack/vue/1.0.0/registry.json',
 *   { filePath: 'vite.config.ts', currentContent: '...', incomingContent: '...' },
 *   { language: 'ts' }
 * )
 * ```
 */

import path from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { registry } from '../../registry/client.js'
import { rm, mkdtemp, writeFile } from 'node:fs/promises'

import type { MergeParams, MergeResult } from './index.js'
import type { Language, MergeStrategyConfig } from '../../registry/types.js'

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Helper functions and environment information provided to custom merge plugins.
 */
export interface MergeHelpers {
  /** Language variant (e.g., 'ts', 'js'). */
  language?: Language
}

/**
 * Plugin interface for custom merge strategies.
 */
export interface MergePlugin {
  merge(
    params: MergeParams,
    helpers: MergeHelpers
  ): MergeResult | Promise<MergeResult>
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Load and execute a custom merge plugin.
 *
 * @param mergeStrategy - Merge strategy configuration (must be `type: 'custom'`)
 * @param registryUrl - Full URL to the parent registry.json
 * @param params - Merge parameters passed to the plugin
 * @param helpers - Helper functions and environment information
 * @returns Merge result from the plugin
 * @throws {Error} If plugin loading or execution fails
 */
export async function executePlugin(
  mergeStrategy: MergeStrategyConfig,
  registryUrl: string,
  params: MergeParams,
  helpers: MergeHelpers
): Promise<MergeResult> {
  const scriptPath = mergeStrategy.script

  if (!scriptPath) {
    throw new Error(
      'Invalid plugin configuration: script path must be provided'
    )
  }

  const isRemote =
    registryUrl.startsWith('http://') || registryUrl.startsWith('https://')

  let tempDir: string | null = null

  try {
    try {
      let resolvedPath: string
      if (isRemote) {
        tempDir = await mkdtemp(path.join(tmpdir(), 'rack-plugin-'))
        resolvedPath = await downloadRemotePlugin(
          scriptPath,
          registryUrl,
          tempDir
        )
      } else {
        resolvedPath = resolveLocalPlugin(scriptPath, deriveRoot(registryUrl))
      }

      const pluginModule = await loadModule(resolvedPath)

      if (typeof pluginModule.merge !== 'function') {
        throw new Error(`Plugin ${scriptPath} must export a 'merge' function`)
      }

      const result = await pluginModule.merge(params, helpers)

      if (
        !result ||
        typeof result !== 'object' ||
        typeof result.content !== 'string'
      ) {
        throw new Error(
          `Plugin ${scriptPath} must return a MergeResult object with content as string`
        )
      }

      return {
        content: result.content,
        strategy: 'custom' as const,
        changed: result.changed ?? true,
        warnings: result.warnings ?? []
      }
    } finally {
      if (tempDir) {
        await rm(tempDir, { recursive: true, force: true })
      }
    }
  } catch (error) {
    throw new Error(
      `Plugin execution failed for ${scriptPath}: ${(error as Error).message}`
    )
  }
}

// ─── Internal ───────────────────────────────────────────────────────────────

/**
 * Derive the registry root directory from a local registry URL.
 *
 * @param registryUrl - File URL or local path to registry.json
 * @returns Root directory path
 */
function deriveRoot(registryUrl: string): string {
  return path.dirname(registryUrl.replace(/^file:\/\//, ''))
}

/**
 * Download a remote plugin script into a caller-provided temporary directory.
 *
 * Only the entry script is fetched; relative imports inside the script are
 * not resolved. The caller owns `tempDir` and is responsible for removing it
 * after the plugin finishes executing.
 *
 * @param scriptPath  - Relative path to the plugin script
 * @param registryUrl - Full URL of the registry.json file
 * @param tempDir     - Caller-owned temp directory to write the script into
 * @returns Absolute path to the downloaded plugin file
 */
async function downloadRemotePlugin(
  scriptPath: string,
  registryUrl: string,
  tempDir: string
): Promise<string> {
  const content = await registry.fetchFile(registryUrl, scriptPath)
  const ext = path.extname(scriptPath) || '.js'
  const pluginPath = path.join(tempDir, `plugin${ext}`)
  await writeFile(pluginPath, content, 'utf-8')

  return pluginPath
}

/**
 * Resolve a local plugin path with traversal protection.
 *
 * @param scriptPath - Relative path to the plugin script
 * @param registryRoot - Root directory of the registry
 * @returns Absolute path to the plugin file
 * @throws {Error} If path traversal is detected
 */
function resolveLocalPlugin(scriptPath: string, registryRoot: string): string {
  const root = path.resolve(registryRoot)
  const resolved = path.resolve(root, scriptPath)
  const relative = path.relative(root, resolved)

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(
      `Invalid plugin path: ${scriptPath} (path traversal detected)`
    )
  }

  return resolved
}

/**
 * Load a plugin module — tries ESM first, falls back to CommonJS.
 *
 * @param resolvedPath - Absolute path to the plugin file
 * @returns Plugin module with optional merge function
 */
async function loadModule(
  resolvedPath: string
): Promise<{ merge?: MergePlugin['merge'] }> {
  try {
    return await import(pathToFileURL(resolvedPath).href)
  } catch (esmError) {
    try {
      const require = createRequire(import.meta.url)
      return require(resolvedPath)
    } catch (cjsError) {
      throw new Error(
        `Failed to load plugin: ${(esmError as Error).message} or ${(cjsError as Error).message}`
      )
    }
  }
}
