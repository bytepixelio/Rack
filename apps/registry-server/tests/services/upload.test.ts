import { join } from 'path'
import { tmpdir } from 'os'
import { createHash } from 'crypto'
import type { FastifyBaseLogger } from 'fastify'
import { AuthService } from '../../src/services/auth.service.js'
import { UploadService } from '../../src/services/upload.service.js'
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'fs/promises'
import { StorageService } from '../../src/services/storage.service.js'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { WebhookService } from '../../src/services/webhook.service.js'
import type { R2UploadBackend } from '../../src/services/r2-upload-backend.js'
import type { SchemaValidatorService } from '../../src/services/schema-validator.service.js'

function createMockLogger(): FastifyBaseLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: 'silent',
    silent: vi.fn()
  } as unknown as FastifyBaseLogger
}

function createMockWebhook(): WebhookService {
  return {
    emitEvent: vi.fn(),
    load: vi.fn()
  } as unknown as WebhookService
}

function createMockValidator(shouldPass = true): SchemaValidatorService {
  return {
    validate: shouldPass
      ? vi.fn().mockResolvedValue(undefined)
      : vi.fn().mockRejectedValue(new Error('Schema validation failed'))
  } as unknown as SchemaValidatorService
}

describe('UploadService', () => {
  let tempDir: string
  let storage: StorageService
  let logger: ReturnType<typeof createMockLogger>

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'upload-test-'))
    storage = new StorageService(tempDir)
    logger = createMockLogger()
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  function createMockAuth(namespaces: string[] = ['@rack']) {
    const allowed = new Set(namespaces)
    return {
      load: vi.fn(),
      isNamespaceAllowed: vi.fn((ns: string) => allowed.has(ns)),
      isNamespaceAnonymous: vi.fn(() => true),
      verifyAccess: vi.fn(() => ({ allowed: true, reason: 'anonymous' }))
    } as unknown as AuthService
  }

  function createMockR2(): R2UploadBackend {
    return {
      exists: vi.fn().mockResolvedValue(false),
      uploadDirectory: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
      findVersions: vi.fn().mockResolvedValue([])
    } as unknown as R2UploadBackend
  }

  function createUpload(
    opts: {
      namespaces?: string[]
      validator?: SchemaValidatorService
      webhook?: WebhookService
      r2?: R2UploadBackend
    } = {}
  ) {
    return new UploadService(
      tempDir,
      createMockAuth(opts.namespaces ?? ['@rack']),
      storage,
      opts.validator ?? createMockValidator(),
      opts.webhook ?? createMockWebhook(),
      logger,
      opts.r2
    )
  }

  // ─── isValidMimeType ─────────────────────────────────────────────────────

  it('should accept valid tar.gz mime types', () => {
    const upload = createUpload()
    expect(upload.isValidMimeType('application/gzip')).toBe(true)
    expect(upload.isValidMimeType('application/x-gzip')).toBe(true)
    expect(upload.isValidMimeType('application/octet-stream')).toBe(true)
  })

  it('should reject invalid mime types', () => {
    const upload = createUpload()
    expect(upload.isValidMimeType('text/plain')).toBe(false)
    expect(upload.isValidMimeType('image/png')).toBe(false)
  })

  // ─── verifyChecksum ──────────────────────────────────────────────────────

  it('should pass when checksum matches', async () => {
    const upload = createUpload()
    const filePath = join(tempDir, 'file.bin')
    await writeFile(filePath, 'test content')

    const hash = createHash('sha256').update('test content').digest('hex')
    await expect(upload.verifyChecksum(filePath, hash)).resolves.toBeUndefined()
  })

  it('should throw when checksum does not match', async () => {
    const upload = createUpload()
    const filePath = join(tempDir, 'file.bin')
    await writeFile(filePath, 'test content')

    await expect(upload.verifyChecksum(filePath, 'wrong-hash')).rejects.toThrow(
      'Checksum verification failed'
    )
  })

  // ─── parsePackageInfo ────────────────────────────────────────────────────

  it('should parse valid package info', async () => {
    const upload = createUpload()
    const extractDir = join(tempDir, 'extracted')
    await mkdir(extractDir, { recursive: true })
    await writeFile(
      join(extractDir, 'registry.json'),
      JSON.stringify({ namespace: '@rack', name: 'node', version: '1.0.0' })
    )

    const info = await upload.parsePackageInfo(extractDir)
    expect(info).toEqual({ namespace: '@rack', name: 'node', version: '1.0.0' })
  })

  it('should throw when registry.json is missing', async () => {
    const upload = createUpload()
    const emptyDir = join(tempDir, 'empty')
    await mkdir(emptyDir, { recursive: true })

    await expect(upload.parsePackageInfo(emptyDir)).rejects.toThrow(
      'registry.json not found'
    )
  })

  it('should throw when namespace is missing', async () => {
    const upload = createUpload()
    const dir = join(tempDir, 'no-namespace')
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'registry.json'),
      JSON.stringify({ name: 'node', version: '1.0.0' })
    )

    await expect(upload.parsePackageInfo(dir)).rejects.toThrow(
      'namespace is required'
    )
  })

  it('should throw when name is missing', async () => {
    const upload = createUpload()
    const dir = join(tempDir, 'no-name')
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'registry.json'),
      JSON.stringify({ namespace: '@rack', version: '1.0.0' })
    )

    await expect(upload.parsePackageInfo(dir)).rejects.toThrow(
      'name is required'
    )
  })

  it('should throw when version is missing', async () => {
    const upload = createUpload()
    const dir = join(tempDir, 'no-version')
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'registry.json'),
      JSON.stringify({ namespace: '@rack', name: 'node' })
    )

    await expect(upload.parsePackageInfo(dir)).rejects.toThrow(
      'version is required'
    )
  })

  // ─── validateNamespace ───────────────────────────────────────────────────

  it('should not throw for allowed namespace', () => {
    const upload = createUpload({ namespaces: ['@rack', '@company'] })
    expect(() => upload.validateNamespace('@rack')).not.toThrow()
  })

  it('should throw for disallowed namespace', () => {
    const upload = createUpload({ namespaces: ['@rack'] })
    expect(() => upload.validateNamespace('@evil')).toThrow('not allowed')
  })

  // ─── install ─────────────────────────────────────────────────────────────

  it('should install package and update versions.json', async () => {
    const upload = createUpload()

    const extractDir = join(tempDir, 'extract')
    await mkdir(extractDir, { recursive: true })
    await writeFile(join(extractDir, 'registry.json'), '{}')

    await upload.install(extractDir, '@rack', 'node', '1.0.0')

    expect(
      await storage.exists(
        join(tempDir, '@rack', 'node', '1.0.0', 'registry.json')
      )
    ).toBe(true)

    const versionsRaw = await readFile(
      join(tempDir, '@rack', 'node', 'versions.json'),
      'utf-8'
    )
    const { versions } = JSON.parse(versionsRaw)
    expect(versions).toContain('1.0.0')
  })

  it('should warn when regenerateVersions fails', async () => {
    const upload = createUpload()
    const extractDir = join(tempDir, 'extract-regen')
    await mkdir(extractDir, { recursive: true })
    await writeFile(join(extractDir, 'registry.json'), '{}')

    vi.spyOn(storage, 'findVersions').mockRejectedValue(
      new Error('scan failed')
    )

    await upload.install(extractDir, '@rack', 'node', '3.0.0')

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ namespace: '@rack', name: 'node' }),
      'Failed to regenerate versions.json'
    )
    vi.mocked(storage.findVersions).mockRestore()
  })

  it('should throw when version already exists', async () => {
    const upload = createUpload()

    await mkdir(join(tempDir, '@rack', 'node', '1.0.0'), { recursive: true })

    const extractDir = join(tempDir, 'extract')
    await mkdir(extractDir, { recursive: true })

    await expect(
      upload.install(extractDir, '@rack', 'node', '1.0.0')
    ).rejects.toThrow('already exists')
  })

  // ─── cleanup ─────────────────────────────────────────────────────────────

  it('should remove temp files', async () => {
    const upload = createUpload()
    const tempFile = join(tempDir, 'temp.txt')
    await writeFile(tempFile, '')

    await upload.cleanup(tempFile)
    expect(await storage.exists(tempFile)).toBe(false)
  })

  it('should skip undefined paths', async () => {
    const upload = createUpload()
    await expect(upload.cleanup(undefined, undefined)).resolves.toBeUndefined()
  })

  it('should not throw when cleaning non-existent path', async () => {
    const upload = createUpload()
    await expect(upload.cleanup('/nonexistent/path')).resolves.toBeUndefined()
  })

  it('should log warn when cleanup fails', async () => {
    const upload = createUpload()
    vi.spyOn(storage, 'remove').mockRejectedValue(new Error('remove failed'))

    await upload.cleanup('/some/path')

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/some/path' }),
      'Cleanup failed'
    )
    vi.mocked(storage.remove).mockRestore()
  })

  // ─── emitEvents ──────────────────────────────────────────────────────────

  it('should emit uploaded and version.created events', () => {
    const webhook = createMockWebhook()
    const upload = createUpload({ webhook })

    upload.emitEvents('@rack', 'node', '1.0.0')

    expect(webhook.emitEvent).toHaveBeenCalledTimes(2)
    expect(webhook.emitEvent).toHaveBeenCalledWith('uploaded', {
      namespace: '@rack',
      name: 'node',
      version: '1.0.0'
    })
    expect(webhook.emitEvent).toHaveBeenCalledWith('version.created', {
      namespace: '@rack',
      name: 'node',
      version: '1.0.0'
    })
  })

  it('should not propagate webhook errors', () => {
    const webhook = createMockWebhook()
    vi.mocked(webhook.emitEvent).mockImplementation(() => {
      throw new Error('boom')
    })
    const upload = createUpload({ webhook })

    expect(() => upload.emitEvents('@rack', 'node', '1.0.0')).not.toThrow()
  })

  // ─── R2 install ───────────────────────────────────────────────────────────

  it('should install to R2 when r2 backend is provided', async () => {
    const r2 = createMockR2()
    const upload = createUpload({ r2 })

    const extractDir = join(tempDir, 'extract-r2')
    await mkdir(extractDir, { recursive: true })
    await writeFile(join(extractDir, 'registry.json'), '{}')

    await upload.install(extractDir, '@rack', 'node', '1.0.0')

    expect(r2.uploadDirectory).toHaveBeenCalledWith(
      extractDir,
      '@rack/node/1.0.0'
    )
    expect(r2.writeFile).toHaveBeenCalledWith(
      '@rack/node/versions.json',
      expect.stringContaining('1.0.0')
    )
  })

  it('should throw when version already exists in R2', async () => {
    const r2 = createMockR2()
    vi.mocked(r2.exists).mockResolvedValue(true)
    const upload = createUpload({ r2 })

    const extractDir = join(tempDir, 'extract-r2-dup')
    await mkdir(extractDir, { recursive: true })

    await expect(
      upload.install(extractDir, '@rack', 'node', '1.0.0')
    ).rejects.toThrow('already exists')
  })

  it('should regenerate versions.json from R2', async () => {
    const r2 = createMockR2()
    vi.mocked(r2.findVersions).mockResolvedValue(['1.0.0', '0.9.0'])
    const upload = createUpload({ r2 })

    const extractDir = join(tempDir, 'extract-r2-ver')
    await mkdir(extractDir, { recursive: true })
    await writeFile(join(extractDir, 'registry.json'), '{}')

    await upload.install(extractDir, '@rack', 'node', '2.0.0')

    expect(r2.findVersions).toHaveBeenCalledWith('@rack/node')
    expect(r2.writeFile).toHaveBeenCalledWith(
      '@rack/node/versions.json',
      expect.stringContaining('"2.0.0"')
    )
  })

  it('should install to local when r2 backend is not provided', async () => {
    const upload = createUpload()

    const extractDir = join(tempDir, 'extract-local')
    await mkdir(extractDir, { recursive: true })
    await writeFile(join(extractDir, 'registry.json'), '{}')

    await upload.install(extractDir, '@rack', 'node', '1.0.0')

    expect(
      await storage.exists(
        join(tempDir, '@rack', 'node', '1.0.0', 'registry.json')
      )
    ).toBe(true)
  })
})
