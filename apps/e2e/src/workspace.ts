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
 * The `.rackrc` points both `@rack` and `@presets` at the given registry
 * URL — §6.16 removed the implicit "unknown namespace falls back to
 * default" so each namespace the e2e suite touches must be wired up
 * explicitly. Built-in namespaces still come pre-populated from
 * `getDefaultConfig()`, but the test harness writes them out anyway to
 * pin behavior against the in-process test server URL.
 */
export async function createWorkspace(registryUrl: string): Promise<Workspace> {
  const root = await mkdtemp(path.join(tmpdir(), 'rack-e2e-ws-'))
  const home = path.join(root, 'home')
  const cwd = path.join(root, 'work')

  await mkdir(home, { recursive: true })
  await mkdir(cwd, { recursive: true })

  const rackrc = {
    registries: {
      '@rack': registryUrl,
      '@presets': registryUrl
    }
  }
  await writeFile(path.join(home, '.rackrc'), JSON.stringify(rackrc))

  return {
    cwd,
    home,
    cleanup: () => rm(root, { recursive: true, force: true })
  }
}
