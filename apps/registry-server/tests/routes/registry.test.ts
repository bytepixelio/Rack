import { join } from 'path'
import { tmpdir } from 'os'
import { buildApp } from '../../src/app.js'
import type { FastifyInstance } from 'fastify'
import type { Config } from '../../src/types.js'
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

function createConfig(
  storageRoot: string,
  overrides: Partial<Config> = {}
): Config {
  return {
    port: 0,
    storageRoot,
    nodeEnv: 'test',
    host: '127.0.0.1',
    logLevel: 'silent',
    storageBackend: 'local' as const,
    schemaDir: join(storageRoot, 'schema'),
    authConfigPath: join(storageRoot, 'auth.json'),
    webhookConfigPath: join(storageRoot, 'webhooks.json'),
    ...overrides
  }
}

describe('Registry routes', () => {
  let app: FastifyInstance
  let tempDir: string

  const registryData = {
    name: '@rack/node',
    version: '1.0.0',
    type: 'registry:runtime'
  }

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'registry-route-test-'))

    await mkdir(join(tempDir, '@rack', 'node', '1.0.0'), { recursive: true })
    await mkdir(join(tempDir, '@rack', 'node', '2.0.0'), { recursive: true })
    await writeFile(
      join(tempDir, '@rack', 'node', '1.0.0', 'registry.json'),
      JSON.stringify(registryData)
    )
    await writeFile(
      join(tempDir, '@rack', 'node', '2.0.0', 'registry.json'),
      JSON.stringify({ ...registryData, version: '2.0.0' })
    )
    await writeFile(
      join(tempDir, '@rack', 'node', 'versions.json'),
      JSON.stringify({ versions: ['2.0.0', '1.0.0'] })
    )

    const srcDir = join(tempDir, '@rack', 'node', '1.0.0', 'src')
    await mkdir(srcDir, { recursive: true })
    await writeFile(join(srcDir, 'index.ts'), 'export default {}')

    await writeFile(join(tempDir, 'auth.json'), JSON.stringify({ '@rack': [] }))

    await writeFile(join(tempDir, '.healthcheck'), '')
    app = await buildApp(createConfig(tempDir))
  })

  afterAll(async () => {
    await app?.close()
    await rm(tempDir, { recursive: true, force: true })
  })

  // ─── versions ────────────────────────────────────────────────────────────

  it('GET /registries/@rack/node/versions should return version list', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/registries/@rack/node/versions'
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().versions).toEqual(['2.0.0', '1.0.0'])
  })

  // ─── versioned ───────────────────────────────────────────────────────────

  it('GET /registries/@rack/node/1.0.0 should return specific version', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/registries/@rack/node/1.0.0'
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().version).toBe('1.0.0')
  })

  // ─── latest ──────────────────────────────────────────────────────────────

  it('GET /registries/@rack/node should return latest version', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/registries/@rack/node'
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().version).toBe('2.0.0')
  })

  // ─── files ───────────────────────────────────────────────────────────────

  it('GET /registries/@rack/node/1.0.0/files/src/index.ts should return file', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/registries/@rack/node/1.0.0/files/src/index.ts'
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/typescript')
  })

  // ─── HEAD ────────────────────────────────────────────────────────────────

  it('should support HEAD for versioned registry', async () => {
    const res = await app.inject({
      method: 'HEAD',
      url: '/registries/@rack/node/1.0.0'
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('application/json')
  })

  // ─── errors ──────────────────────────────────────────────────────────────

  it('should return 403 for namespace not in allowlist', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/registries/@evil/node/1.0.0'
    })

    expect(res.statusCode).toBe(403)
    expect(res.json().code).toBe('FORBIDDEN_NAMESPACE')
  })

  it('should return 400 for invalid path', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/registries/no-namespace'
    })
    expect(res.statusCode).toBe(400)
  })

  it('should return 404 for non-existent version', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/registries/@rack/node/9.9.9'
    })
    expect(res.statusCode).toBe(404)
  })

  it('should return 404 for non-existent file', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/registries/@rack/node/1.0.0/files/nope.ts'
    })
    expect(res.statusCode).toBe(404)
  })

  it('should normalize double slashes', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/registries//@rack//node//1.0.0'
    })
    expect(res.statusCode).toBe(200)
  })
})

describe('Registry routes with auth', () => {
  let app: FastifyInstance
  let tempDir: string

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'registry-auth-test-'))

    await mkdir(join(tempDir, '@rack', 'node', '1.0.0'), { recursive: true })
    await writeFile(
      join(tempDir, '@rack', 'node', '1.0.0', 'registry.json'),
      JSON.stringify({ name: '@rack/node', version: '1.0.0' })
    )
    await writeFile(
      join(tempDir, '@rack', 'node', 'versions.json'),
      JSON.stringify({ versions: ['1.0.0'] })
    )

    await writeFile(
      join(tempDir, 'auth.json'),
      JSON.stringify({ '@rack': [{ token: 'valid-token', publish: true }] })
    )

    await writeFile(join(tempDir, '.healthcheck'), '')
    app = await buildApp(createConfig(tempDir))
  })

  afterAll(async () => {
    await app?.close()
    await rm(tempDir, { recursive: true, force: true })
  })

  it('should return 401 when token is missing for protected namespace', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/registries/@rack/node/1.0.0'
    })

    expect(res.statusCode).toBe(401)
    expect(res.json().code).toBe('UNAUTHORIZED')
  })

  it('should return 401 for invalid token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/registries/@rack/node/1.0.0',
      headers: { authorization: 'Bearer wrong-token' }
    })

    expect(res.statusCode).toBe(401)
    expect(res.json().code).toBe('INVALID_TOKEN')
  })

  it('should return 200 with valid token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/registries/@rack/node/1.0.0',
      headers: { authorization: 'Bearer valid-token' }
    })

    expect(res.statusCode).toBe(200)
  })

  it('should accept X-Registry-Token header', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/registries/@rack/node/1.0.0',
      headers: { 'x-registry-token': 'valid-token' }
    })

    expect(res.statusCode).toBe(200)
  })

  it('should cache token across multiple getAuthToken calls', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'token-cache-test-'))
    await writeFile(join(dir, '.healthcheck'), '')
    await writeFile(join(dir, 'auth.json'), JSON.stringify({ '@rack': [] }))

    const testApp = await buildApp(createConfig(dir))

    testApp.get('/test-token-cache', async (request) => {
      const first = request.getAuthToken()
      const second = request.getAuthToken()
      return { first, second, same: first === second }
    })

    const res = await testApp.inject({
      method: 'GET',
      url: '/test-token-cache',
      headers: { authorization: 'Bearer cached-token' }
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      first: 'cached-token',
      second: 'cached-token',
      same: true
    })

    await testApp.close()
    await rm(dir, { recursive: true, force: true })
  })
})
