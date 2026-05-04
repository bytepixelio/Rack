import path from 'node:path'
import { runCli } from '../src/cli.js'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { startServer } from '../src/server.js'
import { verifyBaseline } from '../src/baseline.js'
import { createWorkspace } from '../src/workspace.js'
import { loadSmoke, applySmoke } from '../src/assertions.js'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { discoverPresets, discoverRegistries } from '../src/discover.js'

import type { Material } from '../src/discover.js'
import type { TestServer } from '../src/server.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = path.resolve(HERE, '../../../packages/storage')

const presets = await discoverPresets(STORAGE_ROOT)
const materials = await discoverRegistries(STORAGE_ROOT)
const byId = new Map<string, Material>(materials.map((m) => [m.id, m]))

describe('every preset scaffolds via rk init --ci', () => {
  let server: TestServer

  beforeAll(async () => {
    server = await startServer()
  })

  afterAll(async () => {
    await server.close()
  })

  it.each(presets)('$id', async (preset) => {
    const ws = await createWorkspace(server.url)
    const projectName = `app-${preset.name}`
    const projectDir = path.join(ws.cwd, projectName)

    try {
      const result = await runCli(
        ['init', '-t', preset.id, '-n', projectName, '--ci'],
        { cwd: ws.cwd, home: ws.home }
      )

      expect(result.exitCode, result.stderr || result.stdout).toBe(0)

      const manifest = JSON.parse(
        await readFile(path.join(projectDir, 'rack.json'), 'utf8')
      )

      expect(manifest.name).toBe(projectName)
      expect(manifest.template).toBe(preset.id)
      expect(manifest.items).toEqual(expect.arrayContaining(preset.registries))
      expect(manifest.items).toHaveLength(preset.registries.length)

      // After composition, every member material's declared contract
      // (files / dependencies / devDependencies / scripts) must hold.
      // Running each member's smoke.json against the composed project also
      // catches merge regressions — e.g. if .lintstagedrc's json merge drops
      // a contributor, prettier's and eslint's smoke assertions would both
      // have to survive on the same merged file.
      for (const entry of preset.registries) {
        const id = entry.startsWith('@') ? entry : `@rack/${entry}`
        const material = byId.get(id)
        if (!material) {
          throw new Error(
            `[${preset.id}] unknown member registry: ${entry} (resolved to ${id})`
          )
        }
        await verifyBaseline(material, projectDir)

        const smoke = await loadSmoke(
          path.join(material.dir, 'smoke.json')
        )
        if (smoke) await applySmoke(smoke, projectDir, `${preset.id} → ${id}`)
      }
    } finally {
      await ws.cleanup()
    }
  })
})
