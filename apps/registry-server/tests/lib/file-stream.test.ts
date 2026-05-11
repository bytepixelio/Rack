import { join } from 'path'
import { tmpdir } from 'os'
import { it, vi, expect, describe } from 'vitest'
import { rm, chmod, mkdir, mkdtemp, writeFile } from 'fs/promises'
import { getMimeType, streamFileResponse } from '../../src/lib/file-stream.js'

import type { FastifyReply, FastifyRequest, FastifyBaseLogger } from 'fastify'

describe('getMimeType', () => {
  it('should return text/typescript for .ts files', () => {
    expect(getMimeType('index.ts')).toBe('text/typescript')
  })

  it('should return application/json for .json files', () => {
    expect(getMimeType('data.json')).toBe('application/json')
  })

  it('should return text/javascript for .js files', () => {
    expect(getMimeType('app.js')).toBe('text/javascript')
  })

  it('should return text/html for .html files', () => {
    expect(getMimeType('index.html')).toBe('text/html')
  })

  it('should return application/octet-stream for unknown extensions', () => {
    expect(getMimeType('file.xyz123')).toBe('application/octet-stream')
  })

  it('should handle file paths with directories', () => {
    expect(getMimeType('src/components/App.ts')).toBe('text/typescript')
  })
})

describe('streamFileResponse', () => {
  function createMocks() {
    const request = { method: 'GET' } as unknown as FastifyRequest
    const reply = {
      type: vi.fn().mockReturnThis(),
      etag: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis()
    } as unknown as FastifyReply
    return { request, reply }
  }

  it('should throw NotFoundError for non-existent file', async () => {
    const { request, reply } = createMocks()

    await expect(
      streamFileResponse({
        request,
        reply,
        filePath: '/tmp/nonexistent-file-' + Date.now(),
        contentType: 'text/plain'
      })
    ).rejects.toThrow('Resource not found')
  })

  it('should re-throw unknown fs errors with logger', async () => {
    const { request, reply } = createMocks()
    const longName = 'a'.repeat(300)
    const logger = { error: vi.fn() } as unknown as FastifyBaseLogger

    await expect(
      streamFileResponse({
        request,
        reply,
        filePath: `/tmp/${longName}`,
        contentType: 'text/plain',
        logger
      })
    ).rejects.toThrow()

    expect(logger.error).toHaveBeenCalled()
  })

  it('should stream file with proper headers', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'fs-test-'))
    const filePath = join(tempDir, 'test.json')
    await writeFile(filePath, '{"hello":"world"}')

    const { request, reply } = createMocks()

    await streamFileResponse({
      request,
      reply,
      filePath,
      contentType: 'application/json'
    })

    expect(reply.type).toHaveBeenCalledWith('application/json')
    expect(reply.status).toHaveBeenCalledWith(200)

    await rm(tempDir, { recursive: true, force: true })
  })

  it('should handle HEAD request', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'fs-test-'))
    const filePath = join(tempDir, 'test.json')
    await writeFile(filePath, '{"hello":"world"}')

    const request = { method: 'HEAD' } as unknown as FastifyRequest
    const reply = {
      type: vi.fn().mockReturnThis(),
      etag: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis()
    } as unknown as FastifyReply

    await streamFileResponse({
      request,
      reply,
      filePath,
      contentType: 'application/json'
    })

    expect(reply.status).toHaveBeenCalledWith(200)
    expect(reply.send).toHaveBeenCalledWith()

    await rm(tempDir, { recursive: true, force: true })
  })

  it('should throw ForbiddenError for EACCES', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'fs-test-'))
    const restrictedDir = join(tempDir, 'restricted')
    await mkdir(restrictedDir)
    await writeFile(join(restrictedDir, 'file.txt'), 'hello')
    await chmod(restrictedDir, 0o000)

    const { request, reply } = createMocks()

    try {
      await expect(
        streamFileResponse({
          request,
          reply,
          filePath: join(restrictedDir, 'file.txt'),
          contentType: 'text/plain'
        })
      ).rejects.toThrow('Access denied')
    } finally {
      await chmod(restrictedDir, 0o755)
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})
