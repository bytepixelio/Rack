/**
 * Package.json operations and dependency installation.
 *
 * Handles merging dependencies/scripts into package.json
 * and running `npm install`.
 */

import path from 'node:path'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { PackageJsonInvalidError, getErrorMessage } from './utils/errors.js'
import { pathExists, readJSON, writeJSON } from './infra/fs.js'

const execFileAsync = promisify(execFile)

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PackageJson {
  name?: string
  version?: string
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  [key: string]: unknown
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Update package.json with new dependencies and scripts.
 * Reads the existing file (or creates a new one), merges the provided
 * fields, and writes back. Only non-empty fields are merged.
 *
 * @param projectDir - Project directory containing package.json
 * @param fields - Fields to merge into package.json
 * @returns The updated package.json content
 */
async function update(
  projectDir: string,
  fields: Pick<PackageJson, 'dependencies' | 'devDependencies' | 'scripts'>
): Promise<PackageJson> {
  const filePath = path.join(projectDir, 'package.json')

  let current: PackageJson = {}
  if (await pathExists(filePath)) {
    try {
      current = await readJSON<PackageJson>(filePath)
    } catch (error) {
      // Refuse to silently rewrite a broken package.json — that would
      // wipe scripts, dependencies, packageManager, exports, etc. The
      // user must fix or remove the file before re-running.
      throw new PackageJsonInvalidError(
        `package.json exists but could not be parsed: ${getErrorMessage(error)}`,
        filePath
      )
    }
  }

  if (!current.name) current.name = path.basename(projectDir)
  if (!current.version) current.version = '1.0.0'

  const { dependencies, devDependencies, scripts } = fields

  if (dependencies && Object.keys(dependencies).length > 0) {
    current.dependencies = { ...current.dependencies, ...dependencies }
  }
  if (devDependencies && Object.keys(devDependencies).length > 0) {
    current.devDependencies = { ...current.devDependencies, ...devDependencies }
  }
  if (scripts && Object.keys(scripts).length > 0) {
    current.scripts = { ...current.scripts, ...scripts }
  }

  await writeJSON(filePath, current)
  return current
}

/**
 * Run `npm install` in the project directory.
 *
 * @param projectDir - Directory to run npm install in
 * @throws {Error} If npm is not installed or the command fails
 */
async function install(projectDir: string): Promise<void> {
  await execFileAsync('npm', ['install'], { cwd: projectDir })
}

// ─── Namespace Export ────────────────────────────────────────────────────────

export const pkg = {
  update,
  install
}
