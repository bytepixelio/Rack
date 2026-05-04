/**
 * Apply phase — write registry files to the target directory using merge strategies.
 *
 * Iterates resolved registry items, fetches file content (inline or remote),
 * runs the appropriate merge strategy, and writes the result to disk.
 *
 * @example
 * ```ts
 * const changes = await applyFiles(items, targetDir, language, logger)
 * ```
 */

import path from 'node:path'
import { merge } from './merge/index.js'
import { registry } from '../registry/client.js'
import { getErrorMessage } from '../utils/errors.js'
import {
  chmod,
  readFile,
  writeFile,
  ensureDir,
  pathExists
} from '../infra/fs.js'

import type { Logger } from '../infra/logger.js'
import type { Language, RegistryFile } from '../registry/types.js'
import type { FileChange, ResolvedRegistryItem } from './types.js'

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Apply files from all resolved registry items to the target directory.
 *
 * @param items - Resolved registry items (sorted by dependency + priority)
 * @param targetDir - Absolute path to the target project directory
 * @param language - Language variant for merge strategy resolution
 * @param logger - Logger instance
 * @returns Array of file change records
 */
export async function applyFiles(
  items: ResolvedRegistryItem[],
  targetDir: string,
  language: Language | undefined,
  logger: Logger
): Promise<FileChange[]> {
  const changes: FileChange[] = []

  for (const item of items) {
    logger.info(`Applying registry: ${item.identifier}`)

    for (const file of item.files ?? []) {
      const targetPath = path.join(targetDir, file.target)

      if (file.type === 'registry:asset' && file.path) {
        changes.push(
          await applyBinary(file, item.registryUrl, targetPath, logger)
        )
      } else {
        changes.push(
          await applyText(file, item.registryUrl, targetPath, language, logger)
        )
      }
    }
  }

  return changes
}

// ─── Internal ───────────────────────────────────────────────────────────────

/**
 * Fetch and write a binary asset file.
 *
 * @param file - Registry file descriptor
 * @param registryUrl - Full URL to the parent registry.json
 * @param targetPath - Absolute path to write to
 * @param logger - Logger instance
 * @returns File change record
 */
async function applyBinary(
  file: RegistryFile,
  registryUrl: string,
  targetPath: string,
  logger: Logger
): Promise<FileChange> {
  const exists = await pathExists(targetPath)

  let buffer: Buffer
  try {
    logger.debug(`Fetching binary file: ${file.path}`)
    buffer = await registry.fetchBinaryFile(registryUrl, file.path!)
  } catch (error) {
    logger.error(`Failed to fetch binary file: ${file.path}`, error)
    return {
      type: 'skipped',
      path: file.target,
      warnings: [`Failed to fetch binary file: ${getErrorMessage(error)}`]
    }
  }

  await ensureDir(path.dirname(targetPath))
  await writeFile(targetPath, buffer)

  if (file.executable) {
    await chmod(targetPath, 0o755)
    logger.debug(`Set executable permission for ${file.target}`)
  }

  return {
    path: file.target,
    strategy: 'overwrite',
    type: exists ? 'modified' : 'created'
  }
}

/**
 * Fetch, merge, and write a text file using the appropriate merge strategy.
 *
 * @param file - Registry file descriptor
 * @param registryUrl - Full URL to the parent registry.json
 * @param targetPath - Absolute path to write to
 * @param language - Language variant for merge strategy resolution
 * @param logger - Logger instance
 * @returns File change record
 */
async function applyText(
  file: RegistryFile,
  registryUrl: string,
  targetPath: string,
  language: Language | undefined,
  logger: Logger
): Promise<FileChange> {
  // 1. Resolve incoming content
  let incomingContent: string

  if (file.content !== undefined) {
    incomingContent = file.content
  } else if (file.path) {
    try {
      logger.debug(`Fetching file: ${file.path}`)
      incomingContent = await registry.fetchFile(registryUrl, file.path)
    } catch (error) {
      logger.error(`Failed to fetch file: ${file.path}`, error)
      return {
        type: 'skipped',
        path: file.target,
        warnings: [`Failed to fetch file: ${getErrorMessage(error)}`]
      }
    }
  } else {
    return {
      type: 'skipped',
      path: file.target,
      warnings: ['File has neither content nor path']
    }
  }

  // 2. Read existing content
  const exists = await pathExists(targetPath)
  const currentContent = exists ? await readFile(targetPath) : null

  // 3. Merge
  const result = await merge({
    file,
    language,
    registryUrl,
    currentContent,
    incomingContent,
    filePath: file.target
  })

  // 4. Write
  await ensureDir(path.dirname(targetPath))
  await writeFile(targetPath, result.content)

  if (file.executable) {
    await chmod(targetPath, 0o755)
    logger.debug(`Set executable permission for ${file.target}`)
  }

  return {
    path: file.target,
    strategy: result.strategy,
    type: exists ? 'modified' : 'created',
    warnings: result.warnings.map((w) => w.message)
  }
}
