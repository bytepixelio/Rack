import { join } from 'path'
import { tmpdir } from 'os'
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { R2UploadBackend } from '../../src/services/r2-upload-backend.js'
import type { FastifyBaseLogger } from 'fastify'

// ─── S3 Client Mock ───────────────────────────────────────────────────────────

const mockSend = vi.fn()

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send: mockSend })),
  PutObjectCommand: vi
    .fn()
    .mockImplementation((input) => ({ ...input, _type: 'PutObject' })),
  HeadObjectCommand: vi
    .fn()
    .mockImplementation((input) => ({ ...input, _type: 'HeadObject' })),
  DeleteObjectsCommand: vi
    .fn()
    .mockImplementation((input) => ({ ...input, _type: 'DeleteObjects' })),
  ListObjectsV2Command: vi
    .fn()
    .mockImplementation((input) => ({ ...input, _type: 'ListObjects' }))
}))

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

describe('R2UploadBackend', () => {
  let tempDir: string
  let backend: R2UploadBackend
  let logger: ReturnType<typeof createMockLogger>

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'r2-test-'))
    logger = createMockLogger()
    mockSend.mockReset()

    backend = new R2UploadBackend(
      {
        bucketName: 'test-bucket',
        accountId: 'test-account',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret'
      },
      logger
    )
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  // ─── exists ───────────────────────────────────────────────────────────────

  it('should return true when object exists', async () => {
    mockSend.mockResolvedValue({})

    expect(await backend.exists('@rack/node/1.0.0/registry.json')).toBe(true)
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'test-bucket',
        Key: '@rack/node/1.0.0/registry.json'
      })
    )
  })

  it('should return false when object does not exist', async () => {
    mockSend.mockRejectedValue(new Error('NotFound'))

    expect(await backend.exists('@rack/node/1.0.0/registry.json')).toBe(false)
  })

  // ─── uploadDirectory ──────────────────────────────────────────────────────

  it('should upload all files from a directory', async () => {
    mockSend.mockResolvedValue({})

    const dir = join(tempDir, 'package')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'registry.json'), '{"name":"@rack/node"}')
    await writeFile(join(dir, 'smoke.json'), '{}')

    await backend.uploadDirectory(dir, '@rack/node/1.0.0')

    expect(mockSend).toHaveBeenCalledTimes(2)
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'test-bucket',
        Key: '@rack/node/1.0.0/registry.json'
      })
    )
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'test-bucket',
        Key: '@rack/node/1.0.0/smoke.json'
      })
    )
  })

  it('should upload files from nested directories', async () => {
    mockSend.mockResolvedValue({})

    const dir = join(tempDir, 'package')
    await mkdir(join(dir, 'templates', 'src'), { recursive: true })
    await writeFile(join(dir, 'registry.json'), '{}')
    await writeFile(join(dir, 'templates', 'src', 'index.ts'), 'export {}')

    await backend.uploadDirectory(dir, '@rack/node/1.0.0')

    expect(mockSend).toHaveBeenCalledTimes(2)
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        Key: '@rack/node/1.0.0/templates/src/index.ts'
      })
    )
  })

  it('should upload registry.json last so it acts as a publish marker', async () => {
    mockSend.mockResolvedValue({})

    const dir = join(tempDir, 'package-order')
    await mkdir(join(dir, 'templates'), { recursive: true })
    await writeFile(join(dir, 'registry.json'), '{}')
    await writeFile(join(dir, 'templates', 'a.ts'), 'export {}')
    await writeFile(join(dir, 'templates', 'b.ts'), 'export {}')

    await backend.uploadDirectory(dir, '@rack/node/1.0.0')

    const keys = mockSend.mock.calls.map(
      (call) => (call[0] as { Key: string }).Key
    )
    // registry.json must be the final PutObject so partial failures
    // never leave the publish marker present without its files.
    expect(keys[keys.length - 1]).toBe('@rack/node/1.0.0/registry.json')
  })

  // ─── writeFile ────────────────────────────────────────────────────────────

  it('should write content to R2', async () => {
    mockSend.mockResolvedValue({})

    await backend.writeFile(
      '@rack/node/versions.json',
      '{"versions":["1.0.0"]}'
    )

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'test-bucket',
        Key: '@rack/node/versions.json',
        Body: '{"versions":["1.0.0"]}',
        ContentType: 'application/json'
      })
    )
  })

  // ─── findVersions ────────────────────────────────────────────────────────

  it('should find semver versions from R2 prefixes', async () => {
    mockSend.mockResolvedValue({
      CommonPrefixes: [
        { Prefix: '@rack/node/1.0.0/' },
        { Prefix: '@rack/node/2.1.0/' },
        { Prefix: '@rack/node/0.9.0/' }
      ]
    })

    const versions = await backend.findVersions('@rack/node')

    expect(versions).toEqual(['1.0.0', '2.1.0', '0.9.0'])
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'test-bucket',
        Prefix: '@rack/node/',
        Delimiter: '/'
      })
    )
  })

  it('should skip entries with undefined Prefix', async () => {
    mockSend.mockResolvedValue({
      CommonPrefixes: [
        { Prefix: '@rack/node/1.0.0/' },
        { Prefix: undefined },
        {},
        { Prefix: '@rack/node/2.0.0/' }
      ]
    })

    const versions = await backend.findVersions('@rack/node')
    expect(versions).toEqual(['1.0.0', '2.0.0'])
  })

  it('should filter out non-semver prefixes', async () => {
    mockSend.mockResolvedValue({
      CommonPrefixes: [
        { Prefix: '@rack/node/1.0.0/' },
        { Prefix: '@rack/node/latest/' },
        { Prefix: '@rack/node/2.0.0/' }
      ]
    })

    const versions = await backend.findVersions('@rack/node')
    expect(versions).toEqual(['1.0.0', '2.0.0'])
  })

  it('should return empty array when no versions exist', async () => {
    mockSend.mockResolvedValue({ CommonPrefixes: [] })

    const versions = await backend.findVersions('@rack/node')
    expect(versions).toEqual([])
  })

  it('should handle missing CommonPrefixes', async () => {
    mockSend.mockResolvedValue({})

    const versions = await backend.findVersions('@rack/node')
    expect(versions).toEqual([])
  })

  it('should append trailing slash to prefix', async () => {
    mockSend.mockResolvedValue({})

    await backend.findVersions('@rack/node')

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ Prefix: '@rack/node/' })
    )
  })

  it('should not double-append trailing slash', async () => {
    mockSend.mockResolvedValue({})

    await backend.findVersions('@rack/node/')

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ Prefix: '@rack/node/' })
    )
  })

  it('should follow ListObjectsV2 pagination when finding versions', async () => {
    mockSend
      .mockResolvedValueOnce({
        IsTruncated: true,
        NextContinuationToken: 'page-2',
        CommonPrefixes: [{ Prefix: '@rack/node/1.0.0/' }]
      })
      .mockResolvedValueOnce({
        IsTruncated: false,
        CommonPrefixes: [{ Prefix: '@rack/node/2.0.0/' }]
      })

    const versions = await backend.findVersions('@rack/node')

    expect(versions).toEqual(['1.0.0', '2.0.0'])
    expect(mockSend).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ ContinuationToken: 'page-2' })
    )
  })

  // ─── deletePrefix ────────────────────────────────────────────────────────

  it('should delete every object under a prefix in a single batch call', async () => {
    mockSend
      .mockResolvedValueOnce({
        Contents: [
          { Key: '@rack/node/1.0.0/registry.json' },
          { Key: '@rack/node/1.0.0/templates/index.ts' }
        ]
      })
      .mockResolvedValueOnce({})

    await backend.deletePrefix('@rack/node/1.0.0')

    expect(mockSend).toHaveBeenCalledTimes(2)
    expect(mockSend).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        _type: 'DeleteObjects',
        Delete: {
          Quiet: true,
          Objects: [
            { Key: '@rack/node/1.0.0/registry.json' },
            { Key: '@rack/node/1.0.0/templates/index.ts' }
          ]
        }
      })
    )
  })

  it('should follow ListObjectsV2 pagination when deleting', async () => {
    mockSend
      .mockResolvedValueOnce({
        IsTruncated: true,
        NextContinuationToken: 'page-2',
        Contents: [{ Key: 'a' }]
      })
      .mockResolvedValueOnce({}) // batch delete page 1
      .mockResolvedValueOnce({
        IsTruncated: false,
        Contents: [{ Key: 'b' }]
      })
      .mockResolvedValueOnce({}) // batch delete page 2

    await backend.deletePrefix('prefix')

    expect(mockSend).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        _type: 'ListObjects',
        ContinuationToken: 'page-2'
      })
    )
  })

  it('should skip objects whose Key is undefined', async () => {
    mockSend
      .mockResolvedValueOnce({
        Contents: [{ Key: undefined }, { Key: 'real' }]
      })
      .mockResolvedValueOnce({})

    await backend.deletePrefix('p')

    // Two send calls: list + one batch delete with only the defined Key
    expect(mockSend).toHaveBeenCalledTimes(2)
    expect(mockSend).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        _type: 'DeleteObjects',
        Delete: { Quiet: true, Objects: [{ Key: 'real' }] }
      })
    )
  })

  it('should skip the batch delete call entirely when a page is empty', async () => {
    mockSend.mockResolvedValueOnce({ Contents: [] })

    await backend.deletePrefix('empty-prefix')

    // Only the list call; no DeleteObjects for a zero-key batch
    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  it('should throw when DeleteObjects returns per-key errors', async () => {
    mockSend
      .mockResolvedValueOnce({
        Contents: [{ Key: 'a' }, { Key: 'b' }]
      })
      .mockResolvedValueOnce({
        Errors: [{ Key: 'b', Code: 'AccessDenied', Message: 'no permission' }]
      })

    await expect(backend.deletePrefix('p')).rejects.toThrow(
      /Failed to delete 1 object\(s\) under "p": b: no permission/
    )
  })
})
