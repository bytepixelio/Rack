import path from 'node:path'
import { SEMVER_PATTERN } from '@rack/registry-core'
import { access, readdir, readFile } from 'node:fs/promises'

export interface Preset {
  /** Preset identifier usable with `rk init -t`, e.g. `@presets/node`. */
  id: string
  /** Preset name segment, e.g. `node`. */
  name: string
  /** Raw `registries` list declared in `preset.json`. */
  registries: string[]
  /** Absolute path to the preset.json. */
  presetJsonPath: string
}

export interface Material {
  /** Registry identifier usable with `rk add`, e.g. `@rack/quality/prettier`. */
  id: string
  /** Absolute path to the version directory. */
  dir: string
  /** Path after the namespace, e.g. `quality/prettier`. */
  path: string
  /** Version segment directory name, e.g. `1.0.0`. */
  version: string
  /** Namespace segment, e.g. `@rack`. */
  namespace: string
  /** Absolute path to the registry.json at this version. */
  registryJsonPath: string
}

// Reuse the protocol-level SemVer pattern from registry-core so the e2e
// discovery layer accepts every version shape the schema and server do —
// including `+build` metadata (§6.11). The previous private regex omitted
// build metadata and silently misclassified `1.0.0+build.42` directories
// as path segments, dropping the material from the materials/presets
// suites.
const SEMVER = SEMVER_PATTERN

/**
 * Discover every `registry.json` under a storage root by walking
 * `@namespace/<segments.../><version>/registry.json` paths.
 *
 * Ignores entries whose `registry.json` file is missing.
 */
export async function discoverRegistries(
  storageRoot: string
): Promise<Material[]> {
  const out: Material[] = []

  const entries = await readdir(storageRoot, { withFileTypes: true })
  const namespaces = entries
    .filter((e) => e.isDirectory() && e.name.startsWith('@'))
    .map((e) => e.name)

  for (const namespace of namespaces) {
    await walk(path.join(storageRoot, namespace), namespace, [], out)
  }

  return out
}

async function walk(
  dir: string,
  namespace: string,
  segments: string[],
  out: Material[]
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const sub = path.join(dir, entry.name)

    if (SEMVER.test(entry.name)) {
      const registryJsonPath = path.join(sub, 'registry.json')
      if (!(await exists(registryJsonPath))) continue

      out.push({
        dir: sub,
        namespace,
        registryJsonPath,
        version: entry.name,
        path: segments.join('/'),
        id: `${namespace}/${segments.join('/')}`
      })
      continue
    }

    await walk(sub, namespace, [...segments, entry.name], out)
  }
}

/**
 * Discover every preset under `{storageRoot}/presets/<name>/preset.json`.
 *
 * Throws if any discovered preset file fails to parse or violates the
 * documented shape (`registries` must be a non-empty array of strings).
 * The storage-integrity Vitest suite in `apps/registry-server` is the
 * full `preset.json` schema check; this shape guard exists so that a
 * malformed preset cannot silently fall out of the e2e suite (§6.15).
 */
export async function discoverPresets(storageRoot: string): Promise<Preset[]> {
  const presetsDir = path.join(storageRoot, 'presets')
  if (!(await exists(presetsDir))) return []

  const out: Preset[] = []
  const entries = await readdir(presetsDir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const presetJsonPath = path.join(presetsDir, entry.name, 'preset.json')
    if (!(await exists(presetJsonPath))) continue

    const raw = await readFile(presetJsonPath, 'utf8')
    let parsed: { registries?: unknown }
    try {
      parsed = JSON.parse(raw) as { registries?: unknown }
    } catch (err) {
      throw new Error(
        `Failed to parse preset.json at ${presetJsonPath}: ${(err as Error).message}`
      )
    }
    if (!Array.isArray(parsed.registries)) {
      throw new Error(
        `Invalid preset at ${presetJsonPath}: "registries" must be an array of strings`
      )
    }
    const registries: string[] = []
    for (const r of parsed.registries) {
      if (typeof r !== 'string') {
        throw new Error(
          `Invalid preset at ${presetJsonPath}: "registries" entries must be strings`
        )
      }
      registries.push(r)
    }

    out.push({
      registries,
      presetJsonPath,
      name: entry.name,
      id: `@presets/${entry.name}`
    })
  }

  return out
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}
