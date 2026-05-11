/**
 * Package.json operations and dependency installation.
 *
 * Handles merging dependencies/scripts into package.json
 * and running `npm install`.
 */

import path from 'node:path'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { readJSON, writeJSON, pathExists } from './infra/fs.js'
import { getErrorMessage, PackageJsonInvalidError } from './utils/errors.js'

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
 * Read and parse `package.json` from a project directory.
 *
 * Returns `null` when the file does not exist (a fresh project). Refuses
 * to silently treat a corrupted file as missing — wiping scripts /
 * dependencies / packageManager / exports on the next write would be
 * unrecoverable, so a broken manifest surfaces as a typed error and the
 * caller must fix or remove the file before retrying.
 *
 * @param projectDir - Project directory containing package.json
 * @returns          Parsed contents, or `null` if the file is missing
 * @throws {PackageJsonInvalidError} If the file exists but cannot be parsed
 */
async function read(projectDir: string): Promise<PackageJson | null> {
  const filePath = path.join(projectDir, 'package.json')
  if (!(await pathExists(filePath))) return null
  try {
    return await readJSON<PackageJson>(filePath)
  } catch (error) {
    throw new PackageJsonInvalidError(
      `package.json exists but could not be parsed: ${getErrorMessage(error)}`,
      filePath
    )
  }
}

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
  const current: PackageJson = (await read(projectDir)) ?? {}

  if (!current.name) current.name = path.basename(projectDir)
  if (!current.version) current.version = '1.0.0'

  const { dependencies, devDependencies, scripts } = fields

  // Runtime-wins placement across calls: `resolveDependencies` already keeps
  // a single batch from writing the same package to both fields, but a stale
  // entry from an earlier `rk add` can survive on the other side. Reconcile
  // it here so multi-call results match a single-batch preset install.
  if (dependencies && Object.keys(dependencies).length > 0) {
    const nextDev = { ...current.devDependencies }
    for (const name of Object.keys(dependencies)) delete nextDev[name]
    current.dependencies = { ...current.dependencies, ...dependencies }
    current.devDependencies = nextDev
  }
  if (devDependencies && Object.keys(devDependencies).length > 0) {
    const nextRuntime = { ...current.dependencies }
    const nextDev = { ...current.devDependencies }
    for (const [name, version] of Object.entries(devDependencies)) {
      if (name in nextRuntime) nextRuntime[name] = version
      else nextDev[name] = version
    }
    current.dependencies = nextRuntime
    current.devDependencies = nextDev
  }
  if (current.dependencies && Object.keys(current.dependencies).length === 0) {
    delete current.dependencies
  }
  if (
    current.devDependencies &&
    Object.keys(current.devDependencies).length === 0
  ) {
    delete current.devDependencies
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
  read,
  update,
  install
}
