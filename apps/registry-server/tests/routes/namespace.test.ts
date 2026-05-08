import { join } from 'path'
import { tmpdir } from 'os'
import { buildApp } from '../../src/app.js'
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import type { Config } from '../../src/types.js'
import type { FastifyInstance } from 'fastify'

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
    storageBackend: 'local',
    schemaDir: join(storageRoot, 'schema'),
    authConfigPath: join(storageRoot, 'auth.json'),
    webhookConfigPath: join(storageRoot, 'webhooks.json'),
    ...overrides
  }
}

/** Write auth.json that declares two namespaces: @rack (open) and @secret (token-gated). */
async function seedAuthConfig(dir: string): Promise<void> {
  await writeFile(
    join(dir, 'auth.json'),
    JSON.stringify({
      '@rack': [],
      '@company': [],
      '@secret': [{ token: 'tok-secret' }]
    })
  )
}

/** Scaffold namespace directories used by all tests. */
async function seedStorage(dir: string): Promise<void> {
  await mkdir(join(dir, '@rack', 'node', '1.0.0'), { recursive: true })
  await writeFile(
    join(dir, '@rack', 'node', 'versions.json'),
    '{"versions":["1.0.0"]}'
  )
  await mkdir(join(dir, '@rack', 'vue', '2.0.0'), { recursive: true })
  await writeFile(
    join(dir, '@rack', 'vue', 'versions.json'),
    '{"versions":["2.0.0"]}'
  )
  await mkdir(join(dir, '@company', 'lib', '1.0.0'), { recursive: true })
  await writeFile(
    join(dir, '@company', 'lib', 'versions.json'),
    '{"versions":["1.0.0"]}'
  )
  await mkdir(join(dir, '@secret', 'infra', '1.0.0'), { recursive: true })
  await writeFile(
    join(dir, '@secret', 'infra', 'versions.json'),
    '{"versions":["1.0.0"]}'
  )
  await writeFile(join(dir, '.healthcheck'), '')
}

describe('Namespace routes', () => {
  let app: FastifyInstance
  let tempDir: string

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'ns-test-'))
    await seedStorage(tempDir)
    await seedAuthConfig(tempDir)
    app = await buildApp(createConfig(tempDir, { adminToken: 'admin-master' }))
  })

  afterAll(async () => {
    await app?.close()
    await rm(tempDir, { recursive: true, force: true })
  })

  // ─── GET /namespaces ───────────────────────────────────────────────────

  it('lists only anonymous namespaces when no token is provided', async () => {
    const res = await app.inject({ method: 'GET', url: '/namespaces' })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.namespaces).toContain('@rack')
    expect(body.namespaces).toContain('@company')
    expect(body.namespaces).not.toContain('@secret')
  })

  it('includes token-gated namespace when correct token is provided', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/namespaces',
      headers: { authorization: 'Bearer tok-secret' }
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.namespaces).toContain('@rack')
    expect(body.namespaces).toContain('@secret')
  })

  it('hides token-gated namespace when wrong token is provided', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/namespaces',
      headers: { authorization: 'Bearer wrong' }
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.namespaces).toContain('@rack')
    expect(body.namespaces).not.toContain('@secret')
  })

  it('shows all namespaces when admin token is provided', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/namespaces',
      headers: { authorization: 'Bearer admin-master' }
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.namespaces).toContain('@rack')
    expect(body.namespaces).toContain('@company')
    expect(body.namespaces).toContain('@secret')
  })

  // ─── GET /namespaces/:ns/registries ────────────────────────────────────

  it('lists registries for an anonymous namespace', async () => {
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

  it('returns 401 for token-gated namespace without token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/namespaces/@secret/registries'
    })

    expect(res.statusCode).toBe(401)
    expect(res.json().code).toBe('UNAUTHORIZED')
  })

  it('lists registries for token-gated namespace with correct token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/namespaces/@secret/registries',
      headers: { authorization: 'Bearer tok-secret' }
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.namespace).toBe('@secret')
    expect(body.registries).toContain('infra')
  })

  it('lists registries for token-gated namespace with admin token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/namespaces/@secret/registries',
      headers: { authorization: 'Bearer admin-master' }
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().registries).toContain('infra')
  })

  it('returns 403 for namespace not declared in auth.json', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/namespaces/@unknown/registries'
    })

    expect(res.statusCode).toBe(403)
    expect(res.json().code).toBe('FORBIDDEN_NAMESPACE')
  })

  it('returns 400 for invalid namespace format', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/namespaces/invalid/registries'
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('INVALID_NAMESPACE')
  })

  it('returns 404 for declared namespace with no storage', async () => {
    await writeFile(
      join(tempDir, 'auth.json'),
      JSON.stringify({
        '@rack': [],
        '@company': [],
        '@secret': [{ token: 'tok-secret' }],
        '@empty': []
      })
    )
    await app.authService.load()

    const res = await app.inject({
      method: 'GET',
      url: '/namespaces/@empty/registries'
    })

    expect(res.statusCode).toBe(404)
    expect(res.json().code).toBe('NAMESPACE_NOT_FOUND')

    await seedAuthConfig(tempDir)
    await app.authService.load()
  })

  it('returns 500 for non-ENOENT filesystem error', async () => {
    await writeFile(join(tempDir, '@broken'), 'not a directory')
    await writeFile(
      join(tempDir, 'auth.json'),
      JSON.stringify({
        '@rack': [],
        '@company': [],
        '@secret': [{ token: 'tok-secret' }],
        '@broken': []
      })
    )
    await app.authService.load()

    const res = await app.inject({
      method: 'GET',
      url: '/namespaces/@broken/registries'
    })

    expect(res.statusCode).toBe(500)

    await seedAuthConfig(tempDir)
    await app.authService.load()
  })
})
