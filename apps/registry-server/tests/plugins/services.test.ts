import Fastify from 'fastify'
import { join } from 'path'
import { tmpdir } from 'os'
import { rm, mkdtemp, writeFile } from 'fs/promises'
import { it, vi, expect, describe } from 'vitest'

import servicesPlugin from '../../src/plugins/services.js'

import type { Config } from '../../src/types.js'

function createConfig(storageRoot: string): Config {
  return {
    port: 0,
    storageRoot,
    nodeEnv: 'test',
    trustProxy: false,
    host: '127.0.0.1',
    logLevel: 'silent',
    storageBackend: 'local',
    schemaDir: join(storageRoot, 'schema'),
    authConfigPath: join(storageRoot, 'auth.json'),
    webhookConfigPath: join(storageRoot, 'webhooks.json')
  }
}

describe('servicesPlugin', () => {
  it('logs an error for each namespace rejected by auth.json parsing', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'services-test-'))
    await writeFile(
      join(tempDir, 'auth.json'),
      JSON.stringify({
        '@good': [{ token: 'abc', publish: true }],
        '@bad': 'not-an-array',
        '@also-bad': 123
      })
    )

    const app = Fastify({ logger: { level: 'silent' } })
    const errorSpy = vi.spyOn(app.log, 'error')

    try {
      await app.register(servicesPlugin, { config: createConfig(tempDir) })

      const rejections = errorSpy.mock.calls.filter(
        ([, msg]) => msg === 'auth.json namespace rejected'
      )
      expect(rejections).toHaveLength(2)

      const namespaces = rejections.map(
        ([payload]) => (payload as { namespace: string }).namespace
      )
      expect(namespaces).toEqual(expect.arrayContaining(['@bad', '@also-bad']))
      for (const [payload] of rejections) {
        expect(payload).toMatchObject({
          namespace: expect.any(String),
          reason: expect.any(String)
        })
      }
    } finally {
      await app.close()
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})
