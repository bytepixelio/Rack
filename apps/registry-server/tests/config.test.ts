import { it, vi, expect, describe, beforeEach } from 'vitest'

describe('loadConfig', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  /** Helper: set env vars, dynamically import loadConfig, then restore. */
  async function loadWithEnv(env: Record<string, string | undefined> = {}) {
    const original: Record<string, string | undefined> = {}
    for (const [key, value] of Object.entries(env)) {
      original[key] = process.env[key]
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }

    const { loadConfig } = await import('../src/config.js')
    const config = loadConfig()

    for (const [key] of Object.entries(env)) {
      if (original[key] === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = original[key]
      }
    }

    return config
  }

  it('should use defaults when no env vars are set', async () => {
    const config = await loadWithEnv({ LOG_LEVEL: undefined })

    expect(config.port).toBe(8080)
    expect(config.host).toBe('0.0.0.0')
    expect(config.logLevel).toBe('info')
  })

  it('should use env vars when set', async () => {
    const config = await loadWithEnv({
      PORT: '3000',
      HOST: '127.0.0.1',
      LOG_LEVEL: 'debug',
      NODE_ENV: 'production'
    })

    expect(config.port).toBe(3000)
    expect(config.host).toBe('127.0.0.1')
    expect(config.logLevel).toBe('debug')
    expect(config.nodeEnv).toBe('production')
  })

  it('should fallback to default port for invalid PORT', async () => {
    const config = await loadWithEnv({ PORT: 'abc' })
    expect(config.port).toBe(8080)
  })

  it('should fallback to default port for out-of-range PORT', async () => {
    const config = await loadWithEnv({ PORT: '99999' })
    expect(config.port).toBe(8080)
  })

  it('should fallback to default port for negative PORT', async () => {
    const config = await loadWithEnv({ PORT: '-1' })
    expect(config.port).toBe(8080)
  })

  it('should include adminToken when ADMIN_TOKEN is set', async () => {
    const config = await loadWithEnv({ ADMIN_TOKEN: 'my-secret' })
    expect(config.adminToken).toBe('my-secret')
  })

  it('should trim adminToken whitespace', async () => {
    const config = await loadWithEnv({ ADMIN_TOKEN: '  my-secret  ' })
    expect(config.adminToken).toBe('my-secret')
  })

  it('should set adminToken to undefined when ADMIN_TOKEN is not set', async () => {
    const config = await loadWithEnv({ ADMIN_TOKEN: undefined })
    expect(config.adminToken).toBeUndefined()
  })

  it('should set adminToken to undefined when ADMIN_TOKEN is empty', async () => {
    const config = await loadWithEnv({ ADMIN_TOKEN: '' })
    expect(config.adminToken).toBeUndefined()
  })

  it('should set adminToken to undefined when ADMIN_TOKEN is whitespace only', async () => {
    const config = await loadWithEnv({ ADMIN_TOKEN: '   ' })
    expect(config.adminToken).toBeUndefined()
  })

  // ─── Schema directory ──────────────────────────────────────────────────────

  it('should default schemaDir to <storageRoot>/schema when SCHEMA_DIR unset', async () => {
    const config = await loadWithEnv({
      SCHEMA_DIR: undefined,
      STORAGE_ROOT: '/tmp/store'
    })
    expect(config.schemaDir).toBe('/tmp/store/schema')
  })

  it('should use SCHEMA_DIR when set (decouples schema from storage volume)', async () => {
    const config = await loadWithEnv({
      SCHEMA_DIR: '/app/schema',
      STORAGE_ROOT: '/data'
    })
    expect(config.schemaDir).toBe('/app/schema')
  })

  // ─── Storage backend ───────────────────────────────────────────────────────

  it('should default storageBackend to local', async () => {
    const config = await loadWithEnv({ STORAGE_BACKEND: undefined })
    expect(config.storageBackend).toBe('local')
  })

  it('should set storageBackend to r2 when configured', async () => {
    const config = await loadWithEnv({
      STORAGE_BACKEND: 'r2',
      R2_BUCKET_NAME: 'test-bucket',
      R2_ACCOUNT_ID: 'test-account',
      R2_ACCESS_KEY_ID: 'test-key',
      R2_SECRET_ACCESS_KEY: 'test-secret'
    })
    expect(config.storageBackend).toBe('r2')
    expect(config.r2).toEqual({
      bucketName: 'test-bucket',
      accountId: 'test-account',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret'
    })
  })

  it('should fallback to local for unknown STORAGE_BACKEND values', async () => {
    const config = await loadWithEnv({ STORAGE_BACKEND: 'unknown' })
    expect(config.storageBackend).toBe('local')
  })

  it('should throw when r2 backend is missing required env vars', async () => {
    await expect(
      loadWithEnv({
        STORAGE_BACKEND: 'r2',
        R2_BUCKET_NAME: 'test-bucket',
        R2_ACCOUNT_ID: undefined,
        R2_ACCESS_KEY_ID: undefined,
        R2_SECRET_ACCESS_KEY: undefined
      })
    ).rejects.toThrow('R2 storage backend requires')
  })

  it('should not set r2 config when storageBackend is local', async () => {
    const config = await loadWithEnv({ STORAGE_BACKEND: 'local' })
    expect(config.r2).toBeUndefined()
  })
})
