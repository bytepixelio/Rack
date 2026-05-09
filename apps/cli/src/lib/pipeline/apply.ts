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
import {
  FileFetchError,
  getErrorMessage,
  PathTraversalError
} from '../utils/errors.js'
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
      const targetPath = resolveWithinTarget(targetDir, file.target)

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

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Resolve a file target path and verify it stays within the target directory.
 *
 * @param targetDir - Absolute path to the project root
 * @param target    - Relative target path from the registry file descriptor
 * @returns Absolute resolved path guaranteed to be under {@link targetDir}
 * @throws {@link PathTraversalError} if the resolved path escapes the target directory
 */
function resolveWithinTarget(targetDir: string, target: string): string {
  const resolved = path.resolve(targetDir, target)
  const relative = path.relative(targetDir, resolved)

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new PathTraversalError(
      `File target "${target}" resolves outside the project directory`,
      target
    )
  }

  return resolved
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
    // Manifest-declared files are required: aborting the pipeline keeps
    // package.json / rack.json from recording a successful install when
    // source files are actually missing on disk.
    throw new FileFetchError(
      `Failed to fetch binary file ${file.path}: ${getErrorMessage(error)}`,
      file.path!,
      file.target
    )
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
      // Required file: surface as a typed error so the caller can abort
      // before writing rack.json / package.json.
      throw new FileFetchError(
        `Failed to fetch file ${file.path}: ${getErrorMessage(error)}`,
        file.path,
        file.target
      )
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
