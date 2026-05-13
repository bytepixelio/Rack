import path from 'node:path'
import { tmpdir } from 'node:os'
import { rm, mkdir, mkdtemp, writeFile } from 'node:fs/promises'

export interface Workspace {
  cwd: string
  home: string
  cleanup: () => Promise<void>
}

/** Optional knobs for {@link createWorkspace}. */
export interface CreateWorkspaceOptions {
  /**
   * Extra namespaces (beyond the built-in `@rack` and `@presets`)
   * to wire to the same registry URL. Required after §6.16 because
   * unknown namespaces no longer fall back to the default registry —
   * fixture suites that scaffold their own namespaces (e.g. `@toy`)
   * need to declare them up front.
   */
  extraNamespaces?: string[]
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
export async function createWorkspace(
  registryUrl: string,
  options: CreateWorkspaceOptions = {}
): Promise<Workspace> {
  const root = await mkdtemp(path.join(tmpdir(), 'rack-e2e-ws-'))
  const home = path.join(root, 'home')
  const cwd = path.join(root, 'work')

  await mkdir(home, { recursive: true })
  await mkdir(cwd, { recursive: true })

  const registries: Record<string, string> = {
    '@rack': registryUrl,
    '@presets': registryUrl
  }
  for (const ns of options.extraNamespaces ?? []) {
    registries[ns] = registryUrl
  }
  const rackrc = { registries }
  await writeFile(path.join(home, '.rackrc'), JSON.stringify(rackrc))

  return {
    cwd,
    home,
    cleanup: () => rm(root, { recursive: true, force: true })
  }
}
