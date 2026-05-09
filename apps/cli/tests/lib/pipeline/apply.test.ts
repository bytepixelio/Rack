import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { readFile, writeFile, stat } from 'node:fs/promises'
import { makeTmpDir, cleanTmpDir } from '../../helpers/tmp.js'
import { createItem, createMockLogger } from '../../helpers/mocks.js'
import { PathTraversalError } from '../../../src/lib/utils/errors.js'

vi.mock('../../../src/lib/registry/client.js', () => ({
  registry: { fetchFile: vi.fn(), fetchBinaryFile: vi.fn() }
}))

import { applyFiles } from '../../../src/lib/pipeline/apply.js'
import { registry } from '../../../src/lib/registry/client.js'

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
    const changes = await applyFiles([item], tmp, 'ts', createMockLogger())
    expect(await readFile(join(tmp, 'x.txt'), 'utf8')).toBe('hello\n')
    expect(changes[0]).toMatchObject({ type: 'created', path: 'x.txt' })
  })

  it('reports modified when the target already exists', async () => {
    await writeFile(join(tmp, 'x.txt'), 'old')
    const item = createItem({
      files: [{ type: 'config', target: 'x.txt', content: 'new' }]
    })
    const changes = await applyFiles([item], tmp, undefined, createMockLogger())
    expect(changes[0].type).toBe('modified')
  })

  it('fetches text content via registry.fetchFile when file.path is set', async () => {
    fetchFileMock.mockResolvedValue('remote')
    const item = createItem({
      files: [{ type: 'config', target: 'out.txt', path: './out.txt' }]
    })
    await applyFiles([item], tmp, undefined, createMockLogger())
    expect(await readFile(join(tmp, 'out.txt'), 'utf8')).toBe('remote\n')
  })

  it('aborts the pipeline with FileFetchError when a text file fetch fails', async () => {
    fetchFileMock.mockRejectedValue(new Error('no net'))
    const item = createItem({
      files: [{ type: 'config', target: 'out.txt', path: './out.txt' }]
    })

    await expect(
      applyFiles([item], tmp, undefined, createMockLogger())
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
    const changes = await applyFiles([item], tmp, undefined, createMockLogger())
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
    const changes = await applyFiles([item], tmp, undefined, createMockLogger())
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
      applyFiles([item], tmp, undefined, createMockLogger())
    ).rejects.toMatchObject({
      code: 'FILE_FETCH_FAILED',
      target: 'logo.png'
    })
  })

  it('skips a text file with neither content nor path', async () => {
    const item = createItem({
      files: [{ type: 'config', target: 'out.txt' }]
    })
    const changes = await applyFiles([item], tmp, undefined, createMockLogger())
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
    await applyFiles([item], tmp, undefined, createMockLogger())
    const mode = (await stat(join(tmp, 'bin.sh'))).mode & 0o777
    expect(mode).toBe(0o755)
  })

  it('returns empty changes for items with no files', async () => {
    const changes = await applyFiles(
      [createItem()],
      tmp,
      undefined,
      createMockLogger()
    )
    expect(changes).toEqual([])
  })

  it('rejects target with ".." that escapes the project directory', async () => {
    const item = createItem({
      files: [{ type: 'config', target: '../outside.txt', content: 'evil' }]
    })
    await expect(
      applyFiles([item], tmp, undefined, createMockLogger())
    ).rejects.toThrow(PathTraversalError)
  })

  it('rejects absolute target paths', async () => {
    const item = createItem({
      files: [{ type: 'config', target: '/etc/passwd', content: 'evil' }]
    })
    await expect(
      applyFiles([item], tmp, undefined, createMockLogger())
    ).rejects.toThrow(PathTraversalError)
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
    await expect(
      applyFiles([item], tmp, undefined, createMockLogger())
    ).rejects.toThrow(PathTraversalError)
  })

  it('allows nested subdirectory targets', async () => {
    const item = createItem({
      files: [{ type: 'config', target: 'sub/dir/file.txt', content: 'ok' }]
    })
    const changes = await applyFiles([item], tmp, 'ts', createMockLogger())
    expect(changes[0].type).toBe('created')
    expect(await readFile(join(tmp, 'sub/dir/file.txt'), 'utf8')).toBe('ok\n')
  })
})
