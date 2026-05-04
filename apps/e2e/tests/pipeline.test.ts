import path from 'node:path'
import { runCli } from '../src/cli.js'
import { fileURLToPath } from 'node:url'
import { startServer } from '../src/server.js'
import { readFile, access } from 'node:fs/promises'
import { createWorkspace } from '../src/workspace.js'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import type { TestServer } from '../src/server.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TOY_STORAGE = path.resolve(HERE, '../fixtures/storage')

// Toy fixtures only exist in the in-process server. When pointed at a
// remote registry (RACK_REGISTRY_URL), the @toy namespace isn't deployed,
// so this whole suite self-skips.
describe.skipIf(process.env.RACK_REGISTRY_URL)(
  'pipeline semantics against toy fixtures',
  () => {
    let server: TestServer

    beforeAll(async () => {
      server = await startServer({
        storageRoot: TOY_STORAGE,
        anonymousNamespaces: ['@toy']
      })
    })

    afterAll(async () => {
      await server.close()
    })

    it('rk add @toy/dep auto-installs its registryDependencies', async () => {
      const ws = await createWorkspace(server.url)
      try {
        const result = await runCli(['add', '@toy/dep'], {
          cwd: ws.cwd,
          home: ws.home
        })

        expect(result.exitCode, result.stderr || result.stdout).toBe(0)

        for (const f of ['.toy-base', '.toy-dep']) {
          await expect(
            access(path.join(ws.cwd, f)),
            `expected ${f} to land on disk`
          ).resolves.toBeUndefined()
        }

        const manifest = JSON.parse(
          await readFile(path.join(ws.cwd, 'rack.json'), 'utf8')
        )
        expect(manifest.items).toEqual(expect.arrayContaining(['@toy/dep']))
      } finally {
        await ws.cleanup()
      }
    })
  }
)
