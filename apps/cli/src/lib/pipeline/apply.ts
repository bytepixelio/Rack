/**
 * Apply phase — write registry files to the target directory using merge strategies.
 *
 * Two phases per call:
 *
 * 1. **Plan** — fetch every file and run merges in declaration order,
 *    accumulating each target's final content in memory. Targets
 *    touched by multiple registries see the cumulative result the
 *    same way the old fetch-then-write loop did, except no bytes
 *    have hit disk yet.
 * 2. **Commit** — write each target's final content. If any write
 *    fails, every target already committed in this run is rolled
 *    back (newly-created files deleted; pre-existing files restored
 *    to their original bytes) before the error propagates.
 *
 * Without the split, a mid-pipeline failure (network blip, disk full)
 * left a half-applied project on disk while the caller saw an error.
 */

import path from 'node:path'
import { merge } from './merge/index.js'
import { registry } from '../registry/client.js'
import { rm, stat, readFile as readBuffer } from 'node:fs/promises'
import { chmod, ensureDir, writeFile, pathExists } from '../infra/fs.js'
import {
  FileFetchError,
  getErrorMessage,
  PathTraversalError
} from '../utils/errors.js'

import type { Logger } from '../infra/logger.js'
import type { Language, RegistryFile } from '../registry/types.js'
import type { FileChange, ResolvedRegistryItem } from './types.js'

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Per-target plan accumulated while walking the registry items.
 *
 * Several registries may declare the same `target` (e.g. multiple
 * runtimes appending to `.gitignore`). We collapse those into one
 * `FilePlan` per target so the merge strategy sees the running
 * "current content" — exactly like the old in-place loop did — but
 * commits to disk only once at the end.
 */
interface FilePlan {
  /** Absolute on-disk target path. */
  targetPath: string
  /** Final bytes to write at commit time (last contributor wins for binary). */
  content: string | Buffer
  /** Whether the target existed before this pipeline started. */
  existedBefore: boolean
  /**
   * Original bytes of the target captured before any commit, as a raw
   * Buffer so binary targets round-trip exactly through rollback. Text
   * targets decode this to UTF-8 when fed to the merge engine. `null`
   * when the target did not exist (rollback = delete).
   */
  originalContent: Buffer | null
  /**
   * Original permission bits (mode & 0o777) captured alongside content
   * so rollback can chmod back. `null` when the target did not exist
   * — rollback deletes the file and mode is irrelevant.
   */
  originalMode: number | null
  /** `true` if any contributor set `executable: true`. */
  executable: boolean
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Apply files from all resolved registry items to the target directory.
 *
 * Each item's `resolvedLanguage` (set during fetch) is threaded into
 * its own merge calls so custom plugins receive the language context
 * for the variant the item was loaded as — not a single project-wide
 * value that may disagree with what `applyLanguageOverrides` actually
 * merged into the item's `files`.
 *
 * @param items - Resolved registry items (sorted by dependency + priority)
 * @param targetDir - Absolute path to the target project directory
 * @param logger - Logger instance
 * @returns Array of file change records (one per contributing file)
 * @throws {FileFetchError} If any manifest-declared file fails to fetch
 *                         (no files are written when this happens)
 */
export async function applyFiles(
  items: ResolvedRegistryItem[],
  targetDir: string,
  logger: Logger
): Promise<FileChange[]> {
  const { plans, changes } = await planWrites(items, targetDir, logger)
  await commitWrites(plans, logger)
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

// ─── Internal: Plan phase ──────────────────────────────────────────────────

/**
 * Walk every registry file in declaration order, fetching content and
 * running merge strategies against a running in-memory snapshot per
 * target. Returns the final plan (one write per target) plus the
 * change records (one per contributing file).
 *
 * A fetch failure throws here — by design, since the caller has yet
 * to write anything to disk.
 */
async function planWrites(
  items: ResolvedRegistryItem[],
  targetDir: string,
  logger: Logger
): Promise<{ plans: FilePlan[]; changes: FileChange[] }> {
  const plans = new Map<string, FilePlan>()
  const changes: FileChange[] = []

  for (const item of items) {
    logger.info(`Preparing registry: ${item.identifier}`)

    for (const file of item.files ?? []) {
      const targetPath = resolveWithinTarget(targetDir, file.target)
      const existing =
        plans.get(targetPath) ?? (await snapshotTarget(targetPath))

      if (file.type === 'registry:asset' && file.path) {
        const buffer = await fetchBinary(file, item.registryUrl, logger)
        plans.set(targetPath, {
          targetPath,
          content: buffer,
          existedBefore: existing.existedBefore,
          originalContent: existing.originalContent,
          originalMode: existing.originalMode,
          executable: existing.executable || file.executable === true
        })
        changes.push({
          path: file.target,
          strategy: 'overwrite',
          type: existing.existedBefore ? 'modified' : 'created'
        })
        continue
      }

      // Feed merge whatever the running accumulator says, falling back
      // to the captured original. Buffers are decoded to UTF-8 — lossy
      // for true binaries, but a text contributor on a binary target
      // is a manifest misconfig anyway.
      const currentForMerge =
        existing.content ?? existing.originalContent ?? null
      const result = await mergeText(
        file,
        item.registryUrl,
        typeof currentForMerge === 'string'
          ? currentForMerge
          : (currentForMerge?.toString('utf8') ?? null),
        item.resolvedLanguage,
        logger
      )

      if (result.kind === 'skip') {
        changes.push(result.change)
        continue
      }

      plans.set(targetPath, {
        targetPath,
        content: result.content,
        existedBefore: existing.existedBefore,
        originalContent: existing.originalContent,
        originalMode: existing.originalMode,
        executable: existing.executable || file.executable === true
      })
      changes.push({
        path: file.target,
        strategy: result.strategy,
        type: existing.existedBefore ? 'modified' : 'created',
        warnings: result.warnings
      })
    }
  }

  return { plans: [...plans.values()], changes }
}

/**
 * Read the on-disk state of a target before any contributor touches it.
 *
 * Bytes are captured as a raw `Buffer` so a pre-existing binary (PNG,
 * font, etc.) can be restored on rollback without UTF-8 round-trip
 * corruption. Text mergers decode to UTF-8 on demand in {@link mergeText}.
 *
 * Permission bits are captured alongside the content so rollback can
 * chmod back — Node's `writeFile` preserves existing mode on truncate,
 * so without this snapshot a `chmod 0o755` during commit would survive
 * a content-restoring rollback.
 */
async function snapshotTarget(targetPath: string): Promise<{
  existedBefore: boolean
  originalContent: Buffer | null
  originalMode: number | null
  executable: false
  content: null
}> {
  const existedBefore = await pathExists(targetPath)
  if (!existedBefore) {
    return {
      existedBefore: false,
      originalContent: null,
      originalMode: null,
      executable: false,
      content: null
    }
  }
  const [originalContent, stats] = await Promise.all([
    readBuffer(targetPath),
    stat(targetPath)
  ])
  return {
    existedBefore: true,
    originalContent,
    originalMode: stats.mode & 0o777,
    executable: false,
    content: null
  }
}

/** Fetch a binary asset, mapping any failure to FileFetchError. */
async function fetchBinary(
  file: RegistryFile,
  registryUrl: string,
  logger: Logger
): Promise<Buffer> {
  try {
    logger.debug(`Fetching binary file: ${file.path}`)
    return await registry.fetchBinaryFile(registryUrl, file.path!)
  } catch (error) {
    throw new FileFetchError(
      `Failed to fetch binary file ${file.path}: ${getErrorMessage(error)}`,
      file.path!,
      file.target
    )
  }
}

/**
 * Fetch text content (or read inline `file.content`), run the merge
 * strategy against `currentContent`, and return the merged result.
 * Returns `kind: 'skip'` for descriptors with neither field set.
 */
async function mergeText(
  file: RegistryFile,
  registryUrl: string,
  currentContent: string | null,
  language: Language,
  logger: Logger
): Promise<
  | {
      kind: 'write'
      content: string
      strategy: string
      warnings: string[]
    }
  | { kind: 'skip'; change: FileChange }
> {
  let incomingContent: string
  if (file.content !== undefined) {
    incomingContent = file.content
  } else if (file.path) {
    try {
      logger.debug(`Fetching file: ${file.path}`)
      incomingContent = await registry.fetchFile(registryUrl, file.path)
    } catch (error) {
      throw new FileFetchError(
        `Failed to fetch file ${file.path}: ${getErrorMessage(error)}`,
        file.path,
        file.target
      )
    }
  } else {
    return {
      kind: 'skip',
      change: {
        type: 'skipped',
        path: file.target,
        warnings: ['File has neither content nor path']
      }
    }
  }

  const result = await merge({
    file,
    language,
    registryUrl,
    currentContent,
    incomingContent,
    filePath: file.target
  })

  return {
    kind: 'write',
    content: result.content,
    strategy: result.strategy,
    warnings: result.warnings.map((w) => w.message)
  }
}

// ─── Internal: Commit phase ─────────────────────────────────────────────────

/**
 * Write each plan in order, tracking what got written so a mid-loop
 * failure can roll the directory back to its pre-apply state.
 *
 * Rollback is best-effort: a failure during rollback is logged but
 * does not mask the original error.
 */
async function commitWrites(plans: FilePlan[], logger: Logger): Promise<void> {
  const committed: FilePlan[] = []

  try {
    for (const plan of plans) {
      await ensureDir(path.dirname(plan.targetPath))
      await writeFile(plan.targetPath, plan.content)
      committed.push(plan)

      if (plan.executable) {
        await chmod(plan.targetPath, 0o755)
        logger.debug(`Set executable permission for ${plan.targetPath}`)
      }
    }
  } catch (error) {
    await rollback(committed, logger)
    throw error
  }
}

/** Undo every committed write so the failure looks atomic to the caller. */
async function rollback(committed: FilePlan[], logger: Logger): Promise<void> {
  for (const plan of [...committed].reverse()) {
    try {
      if (!plan.existedBefore) {
        await rm(plan.targetPath, { force: true })
        continue
      }
      if (plan.originalContent !== null) {
        await writeFile(plan.targetPath, plan.originalContent)
      }
      // `writeFile` on an existing file preserves whatever mode the
      // commit phase ended up with — restore the captured original
      // so a chmod-during-commit doesn't survive the rollback.
      if (plan.originalMode !== null) {
        await chmod(plan.targetPath, plan.originalMode)
      }
    } catch (rollbackError) {
      logger.warn(
        `Rollback failed for ${plan.targetPath}: ${getErrorMessage(rollbackError)}`
      )
    }
  }
}
