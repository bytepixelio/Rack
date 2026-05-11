/**
 * Pre-apply validation — cheap checks that fail fast before any bytes hit disk.
 *
 * {@link applyFiles} already writes registry files atomically (plan +
 * commit + rollback), but the surrounding pipeline (`pkg.update`,
 * `rackJson.update`) is not part of that transaction. If `package.json`
 * is unparseable, `pkg.update` rejects mid-pipeline — by which point
 * registry files have already landed on disk and the workspace is in a
 * partially-applied state that contradicts the surfaced "failed" status.
 *
 * Run {@link preflight} between plan-building and {@link applyFiles} to
 * front-load the most common failure mode (a corrupted `package.json`)
 * so the disk stays untouched on rejection.
 */

import { pkg } from '../pkg.js'

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Validate the target directory before any registry write.
 *
 * Currently only verifies that an existing `package.json` parses —
 * unparseable manifests would otherwise fail `pkg.update` *after*
 * {@link applyFiles} has already touched the project. A missing
 * `package.json` is fine; `pkg.update` will synthesize one.
 *
 * @param targetDir - Absolute path to the target project directory
 * @throws {PackageJsonInvalidError} If `package.json` exists but cannot be parsed
 *
 * @example
 * ```ts
 * await preflight(targetDir)
 * const changes = await applyFiles(items, targetDir, logger)
 * ```
 */
export async function preflight(targetDir: string): Promise<void> {
  await pkg.read(targetDir)
}
