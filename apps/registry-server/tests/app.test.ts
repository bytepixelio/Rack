import { join } from 'path'
import { tmpdir } from 'os'
import { buildApp } from '../src/app.js'
import { it, expect, describe } from 'vitest'
import { rm, mkdir, mkdtemp, writeFile } from 'fs/promises'

import type { Config } from '../src/types.js'

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

describe('buildApp', () => {
  it.each([
    { nodeEnv: 'development', logLevel: 'info' as const },
    { nodeEnv: 'production', logLevel: 'silent' as const },
    { nodeEnv: 'test', logLevel: 'debug' as const }
  ])(
    'should start with nodeEnv=$nodeEnv logLevel=$logLevel',
    async (overrides) => {
      const tempDir = await mkdtemp(join(tmpdir(), 'app-test-'))
      await writeFile(join(tempDir, '.healthcheck'), '')
      await writeFile(
        join(tempDir, 'auth.json'),
        JSON.stringify({ '@rack': [] })
      )
      await mkdir(join(tempDir, 'schema'), { recursive: true })

      const app = await buildApp(createConfig(tempDir, overrides))
      const res = await app.inject({ method: 'GET', url: '/health' })
      expect(res.statusCode).toBe(200)

      await app.close()
      await rm(tempDir, { recursive: true, force: true })
    }
  )

  it('should return INTERNAL_SERVER_ERROR for plain Error without code', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'app-test-'))
    await writeFile(join(tempDir, '.healthcheck'), '')
    await writeFile(join(tempDir, 'auth.json'), JSON.stringify({ '@rack': [] }))
    await mkdir(join(tempDir, 'schema'), { recursive: true })

    const app = await buildApp(createConfig(tempDir))

    app.get('/test-plain-error', async () => {
      throw new Error('something broke')
    })

    const res = await app.inject({ method: 'GET', url: '/test-plain-error' })
    expect(res.statusCode).toBe(500)
    expect(res.json().code).toBe('INTERNAL_SERVER_ERROR')
    expect(res.json().message).toBe('something broke')

    await app.close()
    await rm(tempDir, { recursive: true, force: true })
  })

  it('should have all services decorated', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'app-test-'))
    await writeFile(join(tempDir, '.healthcheck'), '')
    await writeFile(join(tempDir, 'auth.json'), JSON.stringify({ '@rack': [] }))
    await mkdir(join(tempDir, 'schema'), { recursive: true })

    const app = await buildApp(createConfig(tempDir))

    expect(app.storageService).toBeDefined()
    expect(app.authService).toBeDefined()
    expect(app.registryService).toBeDefined()
    expect(app.uploadService).toBeDefined()
    expect(app.webhookService).toBeDefined()
    expect(app.schemaValidatorService).toBeDefined()
    expect(app.config).toBeDefined()

    await app.close()
    await rm(tempDir, { recursive: true, force: true })
  })

  it('should log R2 backend enabled when storageBackend is r2', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'app-test-'))
    await writeFile(join(tempDir, '.healthcheck'), '')
    await writeFile(join(tempDir, 'auth.json'), JSON.stringify({ '@rack': [] }))
    await mkdir(join(tempDir, 'schema'), { recursive: true })

    const app = await buildApp(
      createConfig(tempDir, {
        storageBackend: 'r2',
        r2: {
          bucketName: 'test-bucket',
          accountId: 'test-account',
          accessKeyId: 'test-key',
          secretAccessKey: 'test-secret'
        }
      })
    )

    expect(app.uploadService).toBeDefined()

    await app.close()
    await rm(tempDir, { recursive: true, force: true })
  })
})
