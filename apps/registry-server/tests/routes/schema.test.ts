import { join } from 'path'
import { tmpdir } from 'os'
import { buildApp } from '../../src/app.js'
import { rm, mkdir, mkdtemp, writeFile } from 'fs/promises'
import { it, expect, afterAll, describe, beforeAll } from 'vitest'

import type { FastifyInstance } from 'fastify'
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

describe('Schema routes', () => {
  let app: FastifyInstance
  let tempDir: string

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'schema-test-'))
    await mkdir(join(tempDir, 'schema'), { recursive: true })
    await writeFile(
      join(tempDir, 'schema', 'registry-item.json'),
      JSON.stringify({ type: 'object' })
    )
    await writeFile(join(tempDir, '.healthcheck'), '')

    app = await buildApp(createConfig(tempDir))
  })

  afterAll(async () => {
    await app?.close()
    await rm(tempDir, { recursive: true, force: true })
  })

  it('should return schema file for whitelisted name', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/schemas/registry-item.json'
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ type: 'object' })
  })

  it('should support HEAD request', async () => {
    const res = await app.inject({
      method: 'HEAD',
      url: '/schemas/registry-item.json'
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('application/json')
  })

  it('should return 404 for non-whitelisted file', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/schemas/evil.json'
    })

    expect(res.statusCode).toBe(404)
  })

  it('should return 404 when whitelisted file does not exist', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/schemas/preset.json'
    })

    expect(res.statusCode).toBe(404)
  })
})
