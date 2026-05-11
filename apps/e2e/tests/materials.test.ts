import path from 'node:path'
import { runCli } from '../src/cli.js'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { startServer } from '../src/server.js'
import { verifyBaseline } from '../src/baseline.js'
import { createWorkspace } from '../src/workspace.js'
import { discoverRegistries } from '../src/discover.js'
import { loadSmoke, applySmoke } from '../src/assertions.js'
import { it, expect, afterAll, describe, beforeAll } from 'vitest'

import type { TestServer } from '../src/server.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = path.resolve(HERE, '../../../packages/storage')

const materials = await discoverRegistries(STORAGE_ROOT)

describe('every @rack/* registry is installable via rk add', () => {
  let server: TestServer

  beforeAll(async () => {
    server = await startServer()
  })

  afterAll(async () => {
    await server.close()
  })

  it.each(materials)('$id@$version', async (material) => {
    const ws = await createWorkspace(server.url)
    try {
      const result = await runCli(
        ['add', `${material.id}@${material.version}`],
        {
          cwd: ws.cwd,
          home: ws.home
        }
      )

      expect(result.exitCode, result.stderr || result.stdout).toBe(0)

      await verifyBaseline(material, ws.cwd)

      const smoke = await loadSmoke(path.join(material.dir, 'smoke.json'))
      if (smoke) await applySmoke(smoke, ws.cwd, material.id)
    } finally {
      await ws.cleanup()
    }
  })

  it('rk add is idempotent — second invocation is a no-op', async () => {
    const id = '@rack/build/typescript'
    const ws = await createWorkspace(server.url)
    try {
      const first = await runCli(['add', id], { cwd: ws.cwd, home: ws.home })
      expect(first.exitCode, first.stderr || first.stdout).toBe(0)

      const manifestAfterFirst = JSON.parse(
        await readFile(path.join(ws.cwd, 'rack.json'), 'utf8')
      )

      const second = await runCli(['add', id], { cwd: ws.cwd, home: ws.home })
      expect(second.exitCode, second.stderr || second.stdout).toBe(0)

      const manifestAfterSecond = JSON.parse(
        await readFile(path.join(ws.cwd, 'rack.json'), 'utf8')
      )

      expect(manifestAfterSecond.items).toEqual(manifestAfterFirst.items)
      expect(
        manifestAfterSecond.items.filter((x: string) => x === id)
      ).toHaveLength(1)
    } finally {
      await ws.cleanup()
    }
  })
})
