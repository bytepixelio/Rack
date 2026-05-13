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

describe('Preset routes', () => {
  let app: FastifyInstance
  let tempDir: string

  const presetData = { name: 'tutorial', registries: ['@rack/node'] }

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'preset-test-'))
    await mkdir(join(tempDir, 'presets', 'tutorial'), { recursive: true })
    await writeFile(
      join(tempDir, 'presets', 'tutorial', 'preset.json'),
      JSON.stringify(presetData)
    )
    await writeFile(join(tempDir, '.healthcheck'), '')

    app = await buildApp(createConfig(tempDir))
  })

  afterAll(async () => {
    await app?.close()
    await rm(tempDir, { recursive: true, force: true })
  })

  it('should return preset content', async () => {
    const res = await app.inject({ method: 'GET', url: '/presets/tutorial' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual(presetData)
  })

  it('should support HEAD request', async () => {
    const res = await app.inject({ method: 'HEAD', url: '/presets/tutorial' })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('application/json')
  })

  it('should return 404 for non-existent preset', async () => {
    const res = await app.inject({ method: 'GET', url: '/presets/nonexistent' })

    expect(res.statusCode).toBe(404)
  })

  it('returns 400 INVALID_PRESET for encoded traversal (§6.21)', async () => {
    // Pre-fix, `/presets/%2e%2e%2fsecret` decoded to `../secret`,
    // `resolvePresetPath` threw a plain `Error('Path traversal …')`,
    // and the global handler bubbled it as 500 INTERNAL_SERVER_ERROR.
    // The Worker silently 404'd the same URL, breaking Server/Worker
    // parity.
    const res = await app.inject({
      method: 'GET',
      url: '/presets/%2e%2e%2fsecret'
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('INVALID_PRESET')
  })

  it('returns 400 INVALID_PRESET for an uppercase preset name', async () => {
    // Schema enforces kebab-case lowercase; an upper-case name is a
    // client error, not a 404 or a 500.
    const res = await app.inject({ method: 'GET', url: '/presets/Tutorial' })

    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('INVALID_PRESET')
  })
})
