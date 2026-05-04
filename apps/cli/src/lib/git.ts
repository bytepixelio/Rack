/**
 * Git operations for project initialization.
 *
 * Thin wrapper around `git` CLI commands.
 * Error handling (git not installed, repo already exists) is the caller's responsibility.
 */

import path from 'node:path'
import { promisify } from 'node:util'
import { pathExists } from './infra/fs.js'
import { execFile } from 'node:child_process'

const execFileAsync = promisify(execFile)

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Check if a git repository already exists in the directory.
 *
 * @param projectDir - Project directory to check
 * @returns `true` if `.git` directory exists
 */
async function isRepository(projectDir: string): Promise<boolean> {
  return pathExists(path.join(projectDir, '.git'))
}

/**
 * Initialize a new git repository.
 *
 * @param projectDir - Directory to initialize
 * @throws {Error} If `git` is not installed or the command fails
 */
async function init(projectDir: string): Promise<void> {
  await execFileAsync('git', ['init'], { cwd: projectDir })
}

// ─── Namespace Export ────────────────────────────────────────────────────────

export const git = {
  init,
  isRepository
}
