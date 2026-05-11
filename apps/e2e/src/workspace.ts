import path from 'node:path'
import { tmpdir } from 'node:os'
import { rm, mkdir, mkdtemp, writeFile } from 'node:fs/promises'

export interface Workspace {
  cwd: string
  home: string
  cleanup: () => Promise<void>
}

/**
 * Create an isolated temp workspace for one CLI invocation.
 *
 * Lays out a tmp directory containing a `home/` (used as `HOME` so the CLI
 * picks up a synthetic `~/.rackrc`) and a `work/` (used as the CLI's cwd).
 * The `.rackrc` points the `@rack` namespace at the given registry URL;
 * unknown namespaces (e.g. `@presets`) fall back to `@rack` in the CLI.
 */
export async function createWorkspace(registryUrl: string): Promise<Workspace> {
  const root = await mkdtemp(path.join(tmpdir(), 'rack-e2e-ws-'))
  const home = path.join(root, 'home')
  const cwd = path.join(root, 'work')

  await mkdir(home, { recursive: true })
  await mkdir(cwd, { recursive: true })

  const rackrc = { registries: { '@rack': registryUrl } }
  await writeFile(path.join(home, '.rackrc'), JSON.stringify(rackrc))

  return {
    cwd,
    home,
    cleanup: () => rm(root, { recursive: true, force: true })
  }
}
