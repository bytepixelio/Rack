import { join } from 'path'
import { tmpdir } from 'os'
import { buildApp } from '../../src/app.js'
import type { FastifyInstance } from 'fastify'
import type { Config } from '../../src/types.js'
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
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

describe('Namespace routes', () => {
  let app: FastifyInstance
  let tempDir: string

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'ns-test-'))
    await mkdir(join(tempDir, '@rack', 'node', '1.0.0'), { recursive: true })
    await writeFile(
      join(tempDir, '@rack', 'node', 'versions.json'),
      '{"versions":["1.0.0"]}'
    )
    await mkdir(join(tempDir, '@rack', 'vue', '2.0.0'), { recursive: true })
    await writeFile(
      join(tempDir, '@rack', 'vue', 'versions.json'),
      '{"versions":["2.0.0"]}'
    )
    await mkdir(join(tempDir, '@company', 'lib', '1.0.0'), { recursive: true })
    await writeFile(
      join(tempDir, '@company', 'lib', 'versions.json'),
      '{"versions":["1.0.0"]}'
    )
    await writeFile(join(tempDir, '.healthcheck'), '')

    app = await buildApp(createConfig(tempDir))
  })

  afterAll(async () => {
    await app?.close()
    await rm(tempDir, { recursive: true, force: true })
  })

  it('GET /namespaces should list all namespaces', async () => {
    const res = await app.inject({ method: 'GET', url: '/namespaces' })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.namespaces).toContain('@rack')
    expect(body.namespaces).toContain('@company')
  })

  it('GET /namespaces/:ns/registries should list registries', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/namespaces/@rack/registries'
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.namespace).toBe('@rack')
    expect(body.registries).toContain('node')
    expect(body.registries).toContain('vue')
  })

  it('should return 400 for invalid namespace format', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/namespaces/invalid/registries'
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('INVALID_NAMESPACE')
  })

  it('should return 404 for non-existent namespace', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/namespaces/@nonexistent/registries'
    })

    expect(res.statusCode).toBe(404)
    expect(res.json().code).toBe('NAMESPACE_NOT_FOUND')
  })

  it('should return 500 for non-ENOENT filesystem error', async () => {
    await writeFile(join(tempDir, '@broken'), 'not a directory')

    const res = await app.inject({
      method: 'GET',
      url: '/namespaces/@broken/registries'
    })

    expect(res.statusCode).toBe(500)
  })
})
