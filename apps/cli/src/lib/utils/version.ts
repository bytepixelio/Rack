/**
 * CLI version and Node.js engine requirement utilities.
 *
 * Reads `package.json` to extract the CLI version string and the
 * minimum required Node.js version from the `engines` field.
 */

import semver from 'semver'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { readJSON, pathExists } from '../infra/fs.js'

interface PackageJson {
  version?: string
  engines?: {
    node?: string
  }
}

/** Possible locations of package.json relative to this file. */
const PACKAGE_PATHS = [
  '../package.json', // dist/bin.js                → apps/cli/package.json (production)
  '../../../package.json' // src/lib/utils/version.ts → apps/cli/package.json (development)
]

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Locate and read the CLI's package.json.
 *
 * Tries multiple relative paths to handle both development
 * (`src/utils/`) and production (`dist/`) directory layouts.
 *
 * @returns Parsed package.json, or a fallback with version `'0.0.0'`
 */
async function getPackageJson(): Promise<PackageJson> {
  const dir = dirname(fileURLToPath(import.meta.url))

  for (const relative of PACKAGE_PATHS) {
    const fullPath = join(dir, relative)
    if (await pathExists(fullPath)) {
      return await readJSON<PackageJson>(fullPath)
    }
  }

  return { version: '0.0.0' }
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Get the CLI version from package.json.
 *
 * @returns Version string (e.g., `'1.0.0'`)
 */
export async function getCliVersion(): Promise<string> {
  return (await getPackageJson()).version ?? '0.0.0'
}

/**
 * Get the minimum required Node.js version from package.json engines field.
 *
 * Reads `engines.node` (e.g. `">=22.10.0"`) and extracts the lowest
 * satisfying version. Falls back to `'0.0.0'` when the field is
 * missing or the range is invalid.
 *
 * @returns The minimum Node.js version string (e.g., `'22.10.0'`)
 */
export async function getMinNodeVersion(): Promise<string> {
  const range = (await getPackageJson()).engines?.node
  return semver.minVersion(range ?? '')?.version ?? '0.0.0'
}
