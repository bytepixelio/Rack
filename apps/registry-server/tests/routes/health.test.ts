import { join } from 'path'
import { tmpdir } from 'os'
import { buildApp } from '../../src/app.js'
import type { FastifyInstance } from 'fastify'
import type { Config } from '../../src/types.js'
import { mkdtemp, writeFile, rm } from 'fs/promises'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

function createConfig(storageRoot: string): Config {
  return {
    port: 0,
    storageRoot,
    nodeEnv: 'test',
    host: '127.0.0.1',
    logLevel: 'silent',
    storageBackend: 'local',
    schemaDir: join(storageRoot, 'schema'),
    authConfigPath: join(storageRoot, 'auth.json'),
    webhookConfigPath: join(storageRoot, 'webhooks.json')
  }
}

describe('GET /health', () => {
  let app: FastifyInstance
  let tempDir: string

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'health-test-'))
  })

  afterAll(async () => {
    await app?.close()
    await rm(tempDir, { recursive: true, force: true })
  })

  it('should return 200 when storage is accessible', async () => {
    await writeFile(join(tempDir, '.healthcheck'), '')
    app = await buildApp(createConfig(tempDir))

    const res = await app.inject({ method: 'GET', url: '/health' })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('ok')
    expect(body.checks.storage.status).toBe('ok')
  })

  it('should return 503 when storage is not accessible', async () => {
    const badDir = join(tempDir, 'nonexistent')
    app = await buildApp(createConfig(badDir))

    const res = await app.inject({ method: 'GET', url: '/health' })

    expect(res.statusCode).toBe(503)
    const body = res.json()
    expect(body.status).toBe('error')
    expect(body.checks.storage.status).toBe('error')
    expect(body.checks.storage.error).toBeDefined()
  })
})
