import { join } from 'path'
import { tmpdir } from 'os'
import { rm, mkdir, mkdtemp, writeFile } from 'fs/promises'
import { it, vi, expect, afterAll, describe, beforeAll } from 'vitest'

import type { FastifyInstance } from 'fastify'
import type { Config } from '../../src/types.js'

vi.mock('../../src/constants.js', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../src/constants.js')>()
  return { ...original, RATE_LIMIT_MAX: 1 }
})

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

describe('Rate limit plugin', () => {
  let app: FastifyInstance
  let tempDir: string

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'rate-limit-test-'))
    await writeFile(join(tempDir, '.healthcheck'), '')
    await writeFile(join(tempDir, 'auth.json'), JSON.stringify({ '@rack': [] }))
    await mkdir(join(tempDir, 'schema'), { recursive: true })

    const { buildApp } = await import('../../src/app.js')
    app = await buildApp(createConfig(tempDir))
  })

  afterAll(async () => {
    await app?.close()
    await rm(tempDir, { recursive: true, force: true })
  })

  it('should return 429 with { code, message } format when limit exceeded', async () => {
    const first = await app.inject({ method: 'GET', url: '/health' })
    expect(first.statusCode).toBe(200)

    const second = await app.inject({ method: 'GET', url: '/health' })
    expect(second.statusCode).toBe(429)

    const body = second.json()
    expect(body.code).toBe('RATE_LIMIT_EXCEEDED')
    expect(body.message).toMatch(/^Rate limit exceeded\. Try again in \d+s$/)

    expect(body.error).toBeUndefined()
    expect(body.statusCode).toBeUndefined()
    expect(Object.keys(body).sort()).toEqual(['code', 'message'])
  })
})
