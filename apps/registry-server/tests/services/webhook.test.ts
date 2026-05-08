import { join } from 'path'
import { tmpdir } from 'os'
import { rm, mkdir, mkdtemp, writeFile } from 'fs/promises'
import { WebhookService } from '../../src/services/webhook.service.js'
import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest'

import type { FastifyBaseLogger } from 'fastify'

function createMockLogger(): FastifyBaseLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    silent: vi.fn(),
    level: 'silent',
    child: vi.fn().mockReturnThis()
  } as unknown as FastifyBaseLogger
}

const VALID_CONFIG = {
  webhooks: [
    {
      enabled: true,
      secret: 'test-secret',
      description: 'Test hook',
      url: 'https://example.com/hook',
      events: ['uploaded', 'version.created']
    }
  ]
}

describe('WebhookService', () => {
  let tempDir: string
  let logger: ReturnType<typeof createMockLogger>
  let originalFetch: typeof globalThis.fetch

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'webhook-test-'))
    logger = createMockLogger()
    originalFetch = globalThis.fetch
    vi.useFakeTimers()
  })

  afterEach(async () => {
    vi.useRealTimers()
    globalThis.fetch = originalFetch
    await rm(tempDir, { force: true, recursive: true })
  })

  // ─── load ────────────────────────────────────────────────────────────────

  it('should load valid webhook config', async () => {
    const filePath = join(tempDir, 'webhooks.json')
    await writeFile(filePath, JSON.stringify(VALID_CONFIG))

    const service = new WebhookService(filePath, logger)
    await service.load()

    expect(logger.info).toHaveBeenCalledWith({ count: 1 }, 'Webhooks loaded')
  })

  it('should silently disable when file is missing', async () => {
    const service = new WebhookService(join(tempDir, 'nope.json'), logger)
    await service.load()

    expect(logger.info).toHaveBeenCalledWith(
      'No webhooks.json found, webhooks disabled'
    )
  })

  it('should throw when webhooks array is missing', async () => {
    const filePath = join(tempDir, 'bad.json')
    await writeFile(filePath, JSON.stringify({}))

    const service = new WebhookService(filePath, logger)
    await expect(service.load()).rejects.toThrow('missing webhooks array')
  })

  it('should throw when webhook url is missing', async () => {
    const filePath = join(tempDir, 'bad.json')
    await writeFile(
      filePath,
      JSON.stringify({
        webhooks: [{ events: [], secret: 's', enabled: true }]
      })
    )

    const service = new WebhookService(filePath, logger)
    await expect(service.load()).rejects.toThrow('url is required')
  })

  it('should throw when webhook secret is missing', async () => {
    const filePath = join(tempDir, 'bad.json')
    await writeFile(
      filePath,
      JSON.stringify({
        webhooks: [{ events: [], enabled: true, url: 'http://x' }]
      })
    )

    const service = new WebhookService(filePath, logger)
    await expect(service.load()).rejects.toThrow('secret is required')
  })

  it('should throw when events is not an array', async () => {
    const filePath = join(tempDir, 'bad.json')
    await writeFile(
      filePath,
      JSON.stringify({
        webhooks: [
          { secret: 's', enabled: true, url: 'http://x', events: 'uploaded' }
        ]
      })
    )

    const service = new WebhookService(filePath, logger)
    await expect(service.load()).rejects.toThrow('events must be an array')
  })

  it('should throw when enabled is not a boolean', async () => {
    const filePath = join(tempDir, 'bad.json')
    await writeFile(
      filePath,
      JSON.stringify({
        webhooks: [{ events: [], secret: 's', enabled: 'yes', url: 'http://x' }]
      })
    )

    const service = new WebhookService(filePath, logger)
    await expect(service.load()).rejects.toThrow('enabled must be a boolean')
  })

  // ─── emitEvent ───────────────────────────────────────────────────────────

  it('should skip when no webhooks match the event', async () => {
    const filePath = join(tempDir, 'webhooks.json')
    await writeFile(
      filePath,
      JSON.stringify({
        webhooks: [
          {
            secret: 's',
            enabled: true,
            url: 'http://x',
            events: ['version.created']
          }
        ]
      })
    )

    const service = new WebhookService(filePath, logger)
    await service.load()

    service.emitEvent('uploaded', {
      name: 'node',
      version: '1.0.0',
      namespace: '@rack',
      segments: ['node']
    })

    expect(logger.debug).toHaveBeenCalledWith(
      { event: 'uploaded' },
      'No webhooks for this event'
    )
  })

  it('should skip disabled webhooks', async () => {
    const filePath = join(tempDir, 'webhooks.json')
    await writeFile(
      filePath,
      JSON.stringify({
        webhooks: [
          {
            secret: 's',
            enabled: false,
            url: 'http://x',
            events: ['uploaded']
          }
        ]
      })
    )

    const service = new WebhookService(filePath, logger)
    await service.load()

    service.emitEvent('uploaded', {
      name: 'node',
      version: '1.0.0',
      namespace: '@rack',
      segments: ['node']
    })

    expect(logger.debug).toHaveBeenCalledWith(
      { event: 'uploaded' },
      'No webhooks for this event'
    )
  })

  it('should enqueue matching webhooks', async () => {
    const filePath = join(tempDir, 'webhooks.json')
    await writeFile(filePath, JSON.stringify(VALID_CONFIG))

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })

    const service = new WebhookService(filePath, logger)
    await service.load()

    service.emitEvent('uploaded', {
      name: 'node',
      version: '1.0.0',
      namespace: '@rack',
      segments: ['node']
    })

    await vi.advanceTimersByTimeAsync(1)

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'uploaded', count: 1 }),
      'Webhooks enqueued'
    )
  })

  it('should log successful delivery', async () => {
    const filePath = join(tempDir, 'webhooks.json')
    await writeFile(filePath, JSON.stringify(VALID_CONFIG))

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })

    const service = new WebhookService(filePath, logger)
    await service.load()

    service.emitEvent('uploaded', {
      name: 'node',
      version: '1.0.0',
      namespace: '@rack',
      segments: ['node']
    })
    await vi.advanceTimersByTimeAsync(1)

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ status: 200 }),
      'Webhook delivered'
    )
  })

  it('should warn and retry on non-2xx response', async () => {
    const filePath = join(tempDir, 'webhooks.json')
    await writeFile(filePath, JSON.stringify(VALID_CONFIG))

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('error')
      })
      .mockResolvedValueOnce({ ok: true, status: 200 })

    const service = new WebhookService(filePath, logger)
    await service.load()

    service.emitEvent('uploaded', {
      name: 'node',
      version: '1.0.0',
      namespace: '@rack',
      segments: ['node']
    })

    await vi.advanceTimersByTimeAsync(3000)

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 500 }),
      'Webhook got non-2xx'
    )
  })

  it('should handle fetch exceptions and retry', async () => {
    const filePath = join(tempDir, 'webhooks.json')
    await writeFile(filePath, JSON.stringify(VALID_CONFIG))

    globalThis.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ ok: true, status: 200 })

    const service = new WebhookService(filePath, logger)
    await service.load()

    service.emitEvent('uploaded', {
      name: 'node',
      version: '1.0.0',
      namespace: '@rack',
      segments: ['node']
    })
    await vi.advanceTimersByTimeAsync(3000)

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'network error' }),
      'Webhook delivery exception'
    )
  })

  it('should log error after all retries exhausted', async () => {
    const filePath = join(tempDir, 'webhooks.json')
    await writeFile(filePath, JSON.stringify(VALID_CONFIG))

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('fail')
    })

    const service = new WebhookService(filePath, logger)
    await service.load()

    service.emitEvent('uploaded', {
      name: 'node',
      version: '1.0.0',
      namespace: '@rack',
      segments: ['node']
    })

    await vi.advanceTimersByTimeAsync(16000)

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ attempts: 4 }),
      'Webhook failed after all retries'
    )
  })

  it('should throw non-ENOENT errors during load', async () => {
    const filePath = join(tempDir, 'webhooks.json')
    await writeFile(filePath, 'not json')

    const service = new WebhookService(filePath, logger)
    await expect(service.load()).rejects.toThrow()
  })

  it('should throw non-ENOENT filesystem errors during load', async () => {
    await mkdir(join(tempDir, 'is-a-dir'))

    const service = new WebhookService(join(tempDir, 'is-a-dir'), logger)
    await expect(service.load()).rejects.toThrow()
  })

  it('should skip drain when already processing', async () => {
    const filePath = join(tempDir, 'webhooks.json')
    await writeFile(filePath, JSON.stringify(VALID_CONFIG))

    globalThis.fetch = vi
      .fn()
      .mockImplementation(
        () =>
          new Promise((r) =>
            setTimeout(() => r({ ok: true, status: 200 }), 200)
          )
      )

    const service = new WebhookService(filePath, logger)
    await service.load()

    service.emitEvent('uploaded', {
      name: 'node',
      version: '1.0.0',
      namespace: '@rack',
      segments: ['node']
    })
    service.emitEvent('version.created', {
      name: 'node',
      version: '1.0.0',
      namespace: '@rack',
      segments: ['node']
    })

    await vi.advanceTimersByTimeAsync(500)

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(2)
  })

  it('should sort queue with new job before retry job', async () => {
    const filePath = join(tempDir, 'webhooks.json')
    await writeFile(
      filePath,
      JSON.stringify({
        webhooks: [
          {
            enabled: true,
            secret: 'secret',
            url: 'https://example.com/hook',
            events: ['uploaded', 'version.created']
          }
        ]
      })
    )

    let callCount = 0
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('err')
        })
      }
      return Promise.resolve({ ok: true, status: 200 })
    })

    const service = new WebhookService(filePath, logger)
    await service.load()

    service.emitEvent('uploaded', {
      name: 'node',
      version: '1.0.0',
      namespace: '@rack',
      segments: ['node']
    })
    service.emitEvent('version.created', {
      name: 'node',
      version: '1.0.0',
      namespace: '@rack',
      segments: ['node']
    })

    await vi.advanceTimersByTimeAsync(3000)

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(3)
  })

  it('should clear timer when new event arrives during retry wait', async () => {
    const filePath = join(tempDir, 'webhooks.json')
    await writeFile(
      filePath,
      JSON.stringify({
        webhooks: [
          {
            enabled: true,
            secret: 'secret',
            url: 'https://example.com/hook',
            events: ['uploaded', 'version.created']
          }
        ]
      })
    )

    let callCount = 0
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('error')
        })
      }
      return Promise.resolve({ ok: true, status: 200 })
    })

    const service = new WebhookService(filePath, logger)
    await service.load()

    service.emitEvent('uploaded', {
      name: 'node',
      version: '1.0.0',
      namespace: '@rack',
      segments: ['node']
    })
    await vi.advanceTimersByTimeAsync(100)

    service.emitEvent('version.created', {
      name: 'node',
      version: '1.0.0',
      namespace: '@rack',
      segments: ['node']
    })
    await vi.advanceTimersByTimeAsync(3000)

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(3)
  })

  // ─── shutdown ─────────────────────────────────────────────────────────

  it('should discard pending jobs and log warning on shutdown', async () => {
    const filePath = join(tempDir, 'webhooks.json')
    await writeFile(filePath, JSON.stringify(VALID_CONFIG))

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('fail')
    })

    const service = new WebhookService(filePath, logger)
    await service.load()

    service.emitEvent('uploaded', {
      name: 'node',
      version: '1.0.0',
      namespace: '@rack',
      segments: ['node']
    })

    // Let the first attempt fail so there's a retry queued with a timer
    await vi.advanceTimersByTimeAsync(1)

    service.shutdown()

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ pending: 1 }),
      'Webhook queue discarded on shutdown'
    )
  })

  it('should not log warning when shutdown with empty queue', async () => {
    const filePath = join(tempDir, 'webhooks.json')
    await writeFile(filePath, JSON.stringify(VALID_CONFIG))

    const service = new WebhookService(filePath, logger)
    await service.load()

    service.shutdown()

    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('should cancel retry timer on shutdown', async () => {
    const filePath = join(tempDir, 'webhooks.json')
    await writeFile(filePath, JSON.stringify(VALID_CONFIG))

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('fail')
    })

    const service = new WebhookService(filePath, logger)
    await service.load()

    service.emitEvent('uploaded', {
      name: 'node',
      version: '1.0.0',
      namespace: '@rack',
      segments: ['node']
    })
    await vi.advanceTimersByTimeAsync(1)

    service.shutdown()

    // Advance past the retry delay — fetch should NOT be called again
    await vi.advanceTimersByTimeAsync(10000)

    // Only the initial attempt should have been made
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1)
  })
})
