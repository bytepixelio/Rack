import path from 'node:path'
import { readFile, access } from 'node:fs/promises'

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
 * 3. Every `scripts` entry was merged verbatim into `package.json`
 *
 * Throws on the first failure with a message that identifies the material
 * and the specific field. Callers get vitest integration automatically
 * because vitest turns thrown errors into test failures.
 *
 * @param material    - Material record from {@link discoverRegistries}
 * @param projectDir  - Absolute path to the installed project root
 */
export async function verifyBaseline(
  material: Material,
  projectDir: string
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
      if (pkg.scripts?.[name] !== cmd) {
        throw new Error(
          `[${material.id}] expected package.json.scripts.${name} = ${JSON.stringify(cmd)}, got ${JSON.stringify(pkg.scripts?.[name])}`
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
