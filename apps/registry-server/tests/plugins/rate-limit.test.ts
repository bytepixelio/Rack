import { join } from 'path'
import { tmpdir } from 'os'
import { rm, mkdir, mkdtemp, writeFile } from 'fs/promises'
import {
  it,
  vi,
  expect,
  afterAll,
  describe,
  beforeAll,
  afterEach
} from 'vitest'

import type { FastifyInstance } from 'fastify'
import type { Config } from '../../src/types.js'

vi.mock('../../src/constants.js', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../src/constants.js')>()
  return { ...original, RATE_LIMIT_MAX: 1 }
})

function createConfig(
  storageRoot: string,
  trustProxy: Config['trustProxy'] = false
): Config {
  return {
    port: 0,
    storageRoot,
    trustProxy,
    nodeEnv: 'test',
    host: '127.0.0.1',
    logLevel: 'silent',
    storageBackend: 'local',
    schemaDir: join(storageRoot, 'schema'),
    authConfigPath: join(storageRoot, 'auth.json'),
    webhookConfigPath: join(storageRoot, 'webhooks.json')
  }
}

async function seedTempDir(): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), 'rate-limit-test-'))
  await writeFile(join(tempDir, '.healthcheck'), '')
  await writeFile(join(tempDir, 'auth.json'), JSON.stringify({ '@rack': [] }))
  await mkdir(join(tempDir, 'schema'), { recursive: true })
  return tempDir
}

describe('Rate limit plugin', () => {
  let app: FastifyInstance
  let tempDir: string

  beforeAll(async () => {
    tempDir = await seedTempDir()

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

describe('Rate limit + TRUST_PROXY (§6.19)', () => {
  // Each test boots its own buildApp so trustProxy can vary; the rate
  // limiter shares a single in-process bucket per Fastify instance.
  let temps: string[] = []
  let apps: FastifyInstance[] = []

  afterEach(async () => {
    await Promise.all(apps.map((a) => a.close()))
    await Promise.all(temps.map((t) => rm(t, { recursive: true, force: true })))
    apps = []
    temps = []
  })

  async function boot(
    trustProxy: Config['trustProxy']
  ): Promise<FastifyInstance> {
    const tempDir = await seedTempDir()
    temps.push(tempDir)
    const { buildApp } = await import('../../src/app.js')
    const app = await buildApp(createConfig(tempDir, trustProxy))
    apps.push(app)
    return app
  }

  it('keys per connection IP when trustProxy=false (X-Forwarded-For ignored)', async () => {
    const app = await boot(false)

    // Two requests with different X-Forwarded-For values must share the
    // same bucket — Fastify defaults to the socket IP, so a proxy
    // forwarding from many real clients still looks like one caller.
    const r1 = await app.inject({
      url: '/health',
      method: 'GET',
      headers: { 'x-forwarded-for': '198.51.100.1' }
    })
    const r2 = await app.inject({
      url: '/health',
      method: 'GET',
      headers: { 'x-forwarded-for': '198.51.100.2' }
    })
    expect(r1.statusCode).toBe(200)
    expect(r2.statusCode).toBe(429)
  })

  it('keys per X-Forwarded-For client when trustProxy=true', async () => {
    const app = await boot(true)

    // Two requests with different X-Forwarded-For values now key into
    // different buckets — both succeed because each "real" client has
    // its own 1/window allowance.
    const r1 = await app.inject({
      url: '/health',
      method: 'GET',
      headers: { 'x-forwarded-for': '198.51.100.1' }
    })
    const r2 = await app.inject({
      url: '/health',
      method: 'GET',
      headers: { 'x-forwarded-for': '198.51.100.2' }
    })
    expect(r1.statusCode).toBe(200)
    expect(r2.statusCode).toBe(200)

    // A third request from the first IP still gets blocked — proves
    // the per-IP bucket is in effect, not a global pass-through.
    const r3 = await app.inject({
      url: '/health',
      method: 'GET',
      headers: { 'x-forwarded-for': '198.51.100.1' }
    })
    expect(r3.statusCode).toBe(429)
  })
})
