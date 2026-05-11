import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { makeTmpDir, cleanTmpDir } from '../../helpers/tmp.js'
import { stat, chmod, readFile, writeFile } from 'node:fs/promises'
import { createItem, createMockLogger } from '../../helpers/mocks.js'
import { PathTraversalError } from '../../../src/lib/utils/errors.js'
import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest'

vi.mock('../../../src/lib/registry/client.js', () => ({
  registry: { fetchFile: vi.fn(), fetchBinaryFile: vi.fn() }
}))

// Re-export `node:fs/promises` with `rm` replaced by a spy so individual
// tests can force rollback failures without mocking the rest of the
// module (writeFile, mkdir, etc. are used freely in test setup).
vi.mock('node:fs/promises', async () => {
  const actual =
    await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  return { ...actual, rm: vi.fn(actual.rm) }
})

import { rm as rmMock } from 'node:fs/promises'
import { registry } from '../../../src/lib/registry/client.js'
import { applyFiles } from '../../../src/lib/pipeline/apply.js'

const fetchFileMock = registry.fetchFile as unknown as ReturnType<typeof vi.fn>
const fetchBinaryMock = registry.fetchBinaryFile as unknown as ReturnType<
  typeof vi.fn
>

describe('pipeline/apply', () => {
  let tmp: string
  beforeEach(async () => {
    tmp = await makeTmpDir('apply')
    fetchFileMock.mockReset()
    fetchBinaryMock.mockReset()
  })
  afterEach(async () => {
    await cleanTmpDir(tmp)
    vi.restoreAllMocks()
  })

  it('writes inline file.content verbatim for new targets', async () => {
    const item = createItem({
      files: [{ type: 'config', target: 'x.txt', content: 'hello' }]
    })
    const changes = await applyFiles([item], tmp, createMockLogger())
    expect(await readFile(join(tmp, 'x.txt'), 'utf8')).toBe('hello\n')
    expect(changes[0]).toMatchObject({ type: 'created', path: 'x.txt' })
  })

  it('reports modified when the target already exists', async () => {
    await writeFile(join(tmp, 'x.txt'), 'old')
    const item = createItem({
      files: [{ type: 'config', target: 'x.txt', content: 'new' }]
    })
    const changes = await applyFiles([item], tmp, createMockLogger())
    expect(changes[0].type).toBe('modified')
  })

  it('fetches text content via registry.fetchFile when file.path is set', async () => {
    fetchFileMock.mockResolvedValue('remote')
    const item = createItem({
      files: [{ type: 'config', target: 'out.txt', path: './out.txt' }]
    })
    await applyFiles([item], tmp, createMockLogger())
    expect(await readFile(join(tmp, 'out.txt'), 'utf8')).toBe('remote\n')
  })

  it('aborts the pipeline with FileFetchError when a text file fetch fails', async () => {
    fetchFileMock.mockRejectedValue(new Error('no net'))
    const item = createItem({
      files: [{ type: 'config', target: 'out.txt', path: './out.txt' }]
    })

    await expect(
      applyFiles([item], tmp, createMockLogger())
    ).rejects.toMatchObject({
      code: 'FILE_FETCH_FAILED',
      target: 'out.txt',
      sourcePath: './out.txt'
    })
  })

  it('fetches binary assets via registry.fetchBinaryFile', async () => {
    fetchBinaryMock.mockResolvedValue(Buffer.from([1, 2, 3]))
    const item = createItem({
      files: [
        {
          type: 'registry:asset',
          target: 'logo.png',
          path: './logo.png',
          executable: true
        }
      ]
    })
    const changes = await applyFiles([item], tmp, createMockLogger())
    const buf = await readFile(join(tmp, 'logo.png'))
    expect(Array.from(buf)).toEqual([1, 2, 3])
    expect(changes[0].strategy).toBe('overwrite')
    const mode = (await stat(join(tmp, 'logo.png'))).mode & 0o777
    expect(mode).toBe(0o755)
  })

  it('reports modified when binary asset target already exists', async () => {
    await writeFile(join(tmp, 'logo.png'), 'old')
    fetchBinaryMock.mockResolvedValue(Buffer.from([9]))
    const item = createItem({
      files: [
        { type: 'registry:asset', target: 'logo.png', path: './logo.png' }
      ]
    })
    const changes = await applyFiles([item], tmp, createMockLogger())
    expect(changes[0].type).toBe('modified')
  })

  it('aborts the pipeline with FileFetchError when a binary asset fetch fails', async () => {
    fetchBinaryMock.mockRejectedValue(new Error('cdn down'))
    const item = createItem({
      files: [
        { type: 'registry:asset', target: 'logo.png', path: './logo.png' }
      ]
    })

    await expect(
      applyFiles([item], tmp, createMockLogger())
    ).rejects.toMatchObject({
      code: 'FILE_FETCH_FAILED',
      target: 'logo.png'
    })
  })

  it('skips a text file with neither content nor path', async () => {
    const item = createItem({
      files: [{ type: 'config', target: 'out.txt' }]
    })
    const changes = await applyFiles([item], tmp, createMockLogger())
    expect(changes[0]).toMatchObject({
      type: 'skipped',
      warnings: ['File has neither content nor path']
    })
  })

  it('sets executable bit on text files when file.executable is true', async () => {
    const item = createItem({
      files: [
        {
          type: 'config',
          target: 'bin.sh',
          content: '#!/bin/sh',
          executable: true
        }
      ]
    })
    await applyFiles([item], tmp, createMockLogger())
    const mode = (await stat(join(tmp, 'bin.sh'))).mode & 0o777
    expect(mode).toBe(0o755)
  })

  it('returns empty changes for items with no files', async () => {
    const changes = await applyFiles([createItem()], tmp, createMockLogger())
    expect(changes).toEqual([])
  })

  it('rejects target with ".." that escapes the project directory', async () => {
    const item = createItem({
      files: [{ type: 'config', target: '../outside.txt', content: 'evil' }]
    })
    await expect(applyFiles([item], tmp, createMockLogger())).rejects.toThrow(
      PathTraversalError
    )
  })

  it('rejects absolute target paths', async () => {
    const item = createItem({
      files: [{ type: 'config', target: '/etc/passwd', content: 'evil' }]
    })
    await expect(applyFiles([item], tmp, createMockLogger())).rejects.toThrow(
      PathTraversalError
    )
  })

  it('rejects deeply nested ".." traversal', async () => {
    const item = createItem({
      files: [
        {
          type: 'config',
          target: 'a/b/../../../../etc/passwd',
          content: 'evil'
        }
      ]
    })
    await expect(applyFiles([item], tmp, createMockLogger())).rejects.toThrow(
      PathTraversalError
    )
  })

  it('allows nested subdirectory targets', async () => {
    const item = createItem({
      files: [{ type: 'config', target: 'sub/dir/file.txt', content: 'ok' }]
    })
    const changes = await applyFiles([item], tmp, createMockLogger())
    expect(changes[0].type).toBe('created')
    expect(await readFile(join(tmp, 'sub/dir/file.txt'), 'utf8')).toBe('ok\n')
  })

  // ─── Two-phase atomicity ────────────────────────────────────────────────

  it('does not write any file when a later fetch fails', async () => {
    // First file's fetch succeeds, second file's fetch rejects. Phase 1
    // (plan) collects both fetches up front, so the failure must happen
    // *before* any write hits disk.
    fetchFileMock
      .mockResolvedValueOnce('first content')
      .mockRejectedValueOnce(new Error('cdn down'))

    const item = createItem({
      files: [
        { type: 'config', target: 'first.txt', path: './first.txt' },
        { type: 'config', target: 'second.txt', path: './second.txt' }
      ]
    })

    await expect(
      applyFiles([item], tmp, createMockLogger())
    ).rejects.toMatchObject({
      code: 'FILE_FETCH_FAILED',
      target: 'second.txt'
    })

    expect(existsSync(join(tmp, 'first.txt'))).toBe(false)
    expect(existsSync(join(tmp, 'second.txt'))).toBe(false)
  })

  it('rolls back already-written new files when a later commit fails', async () => {
    // Make `occupied` a file so the next item's `occupied/x.txt` target
    // forces ensureDir to fail in commit phase (parent is not a directory).
    await writeFile(join(tmp, 'occupied'), 'i am a file')

    const item = createItem({
      files: [
        { type: 'config', target: 'first.txt', content: 'first' },
        { type: 'config', target: 'occupied/x.txt', content: 'doomed' }
      ]
    })

    await expect(applyFiles([item], tmp, createMockLogger())).rejects.toThrow()

    // first.txt was written then rolled back; occupied stays as the
    // pre-existing file (rollback never touched it).
    expect(existsSync(join(tmp, 'first.txt'))).toBe(false)
    expect(await readFile(join(tmp, 'occupied'), 'utf8')).toBe('i am a file')
  })

  it('restores original content of pre-existing files when commit fails', async () => {
    await writeFile(join(tmp, 'a.txt'), 'original')
    await writeFile(join(tmp, 'occupied'), 'i am a file')

    const item = createItem({
      files: [
        { type: 'config', target: 'a.txt', content: 'overwritten' },
        { type: 'config', target: 'occupied/x.txt', content: 'doomed' }
      ]
    })

    await expect(applyFiles([item], tmp, createMockLogger())).rejects.toThrow()

    expect(await readFile(join(tmp, 'a.txt'), 'utf8')).toBe('original')
  })

  it('threads accumulated text content across registries writing the same target', async () => {
    // Two items both writing to the same target. The second item's
    // merge must see the first item's output as `currentContent`, not
    // whatever was on disk before the pipeline (nothing, in this case).
    const item1 = createItem({
      identifier: '@rack/a',
      files: [{ type: 'config', target: 'shared.txt', content: 'first' }]
    })
    const item2 = createItem({
      identifier: '@rack/b',
      files: [{ type: 'config', target: 'shared.txt', content: 'second' }]
    })

    const changes = await applyFiles([item1, item2], tmp, createMockLogger())

    // Two change records (one per contributor), one final write.
    expect(changes).toHaveLength(2)
    // overwrite strategy → last contributor wins.
    expect(await readFile(join(tmp, 'shared.txt'), 'utf8')).toBe('second\n')
  })

  it('restores pre-existing file permissions when a chmod ran during commit', async () => {
    // Pre-existing non-executable script. A registry promotes it to
    // executable: true in commit phase (chmod 0o755). A later plan
    // fails → rollback. writeFile preserves the commit-time mode on
    // an existing file, so without an explicit chmod-back the mode
    // would stick at 0o755.
    const scriptPath = join(tmp, 'script.sh')
    await writeFile(scriptPath, 'old')
    await chmod(scriptPath, 0o644)
    await writeFile(join(tmp, 'occupied'), 'i am a file')

    const item = createItem({
      files: [
        {
          type: 'config',
          target: 'script.sh',
          content: 'new',
          executable: true
        },
        { type: 'config', target: 'occupied/x.txt', content: 'doomed' }
      ]
    })

    await expect(applyFiles([item], tmp, createMockLogger())).rejects.toThrow()

    expect(await readFile(scriptPath, 'utf8')).toBe('old')
    expect((await stat(scriptPath)).mode & 0o777).toBe(0o644)
  })

  it('restores pre-existing binary files byte-for-byte on rollback', async () => {
    // PNG magic + a non-UTF-8 byte to make sure a string round-trip
    // would corrupt the file — the snapshot/rollback path must use
    // Buffer end-to-end to survive this case.
    const original = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe, 0x00])
    await writeFile(join(tmp, 'logo.png'), original)
    await writeFile(join(tmp, 'occupied'), 'i am a file')

    fetchBinaryMock.mockResolvedValueOnce(Buffer.from([0x00, 0x00, 0x00]))

    const item = createItem({
      files: [
        {
          type: 'registry:asset',
          target: 'logo.png',
          path: './logo.png'
        },
        { type: 'config', target: 'occupied/x.txt', content: 'doomed' }
      ]
    })

    await expect(applyFiles([item], tmp, createMockLogger())).rejects.toThrow()

    const restored = await readFile(join(tmp, 'logo.png'))
    expect(Array.from(restored)).toEqual(Array.from(original))
  })

  it('logs but does not rethrow when rollback itself fails', async () => {
    await writeFile(join(tmp, 'occupied'), 'i am a file')
    const logger = createMockLogger()

    // First file commits OK, second blows up in ensureDir → rollback
    // runs. Force the rollback's `rm` to throw so the catch path is
    // exercised and a warn is emitted instead of masking the original.
    const rm = rmMock as unknown as ReturnType<typeof vi.fn>
    rm.mockImplementationOnce(async () => {
      throw new Error('synthetic rm failure')
    })

    const item = createItem({
      files: [
        { type: 'config', target: 'first.txt', content: 'first' },
        { type: 'config', target: 'occupied/x.txt', content: 'doomed' }
      ]
    })

    await expect(applyFiles([item], tmp, logger)).rejects.toThrow()

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(
        /Rollback failed for .*first\.txt.*synthetic rm failure/
      )
    )
  })
})
