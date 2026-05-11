import path from 'node:path'
import { access, readFile } from 'node:fs/promises'

import type { Material } from './discover.js'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RegistryManifest {
  files?: { target: string }[]
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

interface PackageJson {
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Verify a material's declared contract landed in the project directory:
 *
 * 1. Every `files[].target` exists on disk
 * 2. Every `dependencies` / `devDependencies` key is present in `package.json`
 * 3. Every declared `scripts` entry is reflected in `package.json`. By
 *    default the value must match verbatim (single-material installs have
 *    no override path); pass `allowScriptOverride: true` for preset-level
 *    composition where a downstream registry may legitimately overwrite
 *    the value, and only presence is required.
 *
 * Throws on the first failure with a message that identifies the material
 * and the specific field. Callers get vitest integration automatically
 * because vitest turns thrown errors into test failures.
 *
 * @param material    - Material record from {@link discoverRegistries}
 * @param projectDir  - Absolute path to the installed project root
 * @param options.allowScriptOverride - Treat `scripts` as presence-only
 */
export async function verifyBaseline(
  material: Material,
  projectDir: string,
  options: { allowScriptOverride?: boolean } = {}
): Promise<void> {
  const manifest = JSON.parse(
    await readFile(material.registryJsonPath, 'utf8')
  ) as RegistryManifest

  for (const f of manifest.files ?? []) {
    await assertFileExists(
      path.join(projectDir, f.target),
      `[${material.id}] expected ${f.target} to land on disk`
    )
  }

  if (hasPackageJsonContributions(manifest)) {
    const pkg = JSON.parse(
      await readFile(path.join(projectDir, 'package.json'), 'utf8')
    ) as PackageJson

    for (const name of Object.keys(manifest.dependencies ?? {})) {
      if (pkg.dependencies?.[name] === undefined) {
        throw new Error(
          `[${material.id}] expected package.json.dependencies.${name} to be present`
        )
      }
    }

    for (const name of Object.keys(manifest.devDependencies ?? {})) {
      if (pkg.devDependencies?.[name] === undefined) {
        throw new Error(
          `[${material.id}] expected package.json.devDependencies.${name} to be present`
        )
      }
    }

    for (const [name, cmd] of Object.entries(manifest.scripts ?? {})) {
      const actual = pkg.scripts?.[name]
      if (actual === undefined) {
        throw new Error(
          `[${material.id}] expected package.json.scripts.${name} to be present`
        )
      }
      if (!options.allowScriptOverride && actual !== cmd) {
        throw new Error(
          `[${material.id}] expected package.json.scripts.${name} = ${JSON.stringify(cmd)}, got ${JSON.stringify(actual)}`
        )
      }
    }
  }
}

// ─── Internal ────────────────────────────────────────────────────────────────

function hasPackageJsonContributions(m: RegistryManifest): boolean {
  return Boolean(m.dependencies || m.devDependencies || m.scripts)
}

async function assertFileExists(p: string, message: string): Promise<void> {
  try {
    await access(p)
  } catch {
    throw new Error(message)
  }
}
