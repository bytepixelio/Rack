import path from 'node:path'
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

const SEMVER = /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/

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
    const parsed = JSON.parse(raw) as { registries?: unknown }
    const registries = Array.isArray(parsed.registries)
      ? parsed.registries.filter((r): r is string => typeof r === 'string')
      : []

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
