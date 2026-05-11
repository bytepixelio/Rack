/**
 * Webhook delivery service with retry and HMAC signing.
 *
 * When a registry event occurs, matching webhooks are enqueued
 * and delivered asynchronously. Failed deliveries are retried
 * with exponential backoff.
 *
 * The queue lives in memory — pending jobs are lost on restart.
 */

import { createHmac } from 'crypto'
import { readFile } from 'fs/promises'
import {
  WEBHOOK_TIMEOUT_MS,
  WEBHOOK_USER_AGENT,
  WEBHOOK_MAX_RETRIES,
  WEBHOOK_BASE_DELAY_MS
} from '../constants.js'

import type { FastifyBaseLogger } from 'fastify'
import type {
  WebhookJob,
  WebhookConfig,
  RegistryEventType,
  WebhookConfigFile,
  RegistryEventPayload,
  WebhookDeliveryResult
} from '../types.js'

export class WebhookService {
  private processing = false
  private queue: WebhookJob[] = []
  private readonly filePath: string
  private webhooks: WebhookConfig[] = []
  private readonly logger: FastifyBaseLogger
  private timer: ReturnType<typeof setTimeout> | null = null

  /**
   * Create a new WebhookService.
   *
   * @param filePath - Absolute path to webhooks.json
   * @param logger - Logger instance
   */
  constructor(filePath: string, logger: FastifyBaseLogger) {
    this.logger = logger
    this.filePath = filePath
  }

  /**
   * Load webhook configurations from disk.
   *
   * Missing file → webhooks silently disabled.
   *
   * @throws {Error} On invalid JSON or missing required fields
   *
   * @example
   * // Expected webhooks.json format:
   * // {
   * //   "webhooks": [
   * //     {
   * //       "url": "https://ci.example.com/webhook",
   * //       "secret": "my-secret-key",
   * //       "events": ["uploaded", "version.created"],
   * //       "enabled": true,
   * //       "description": "Trigger CI pipeline"
   * //     }
   * //   ]
   * // }
   */
  async load(): Promise<void> {
    let raw: string

    try {
      raw = await readFile(this.filePath, 'utf-8')
    } catch (error) {
      this.webhooks = []
      if ((error as { code?: string }).code === 'ENOENT') {
        this.logger.info('No webhooks.json found, webhooks disabled')
        return
      }
      throw error
    }

    const config = JSON.parse(raw) as WebhookConfigFile
    this.webhooks = this.validateConfig(config)
    this.logger.info({ count: this.webhooks.length }, 'Webhooks loaded')
  }

  /**
   * Emit an event and enqueue deliveries for matching webhooks.
   *
   * `data.segments` is the registry's storage path under the namespace
   * — `['quality', 'husky']` for `@rack/quality/husky`, `['node']` for a
   * flat-layout registry. The payload's `path` is built as
   * `<namespace>/<segments-joined>/<version>` so subscribers can rebuild
   * the canonical read URL even for multi-segment registries.
   *
   * @param type - Event type
   * @param data - Event context, including segments for path construction
   *
   * @example
   * webhook.emitEvent('uploaded', {
   *   namespace: '@rack',
   *   name: 'husky',
   *   version: '1.0.0',
   *   segments: ['quality', 'husky']
   * })
   * // → payload.path = '@rack/quality/husky/1.0.0'
   */
  emitEvent(
    type: RegistryEventType,
    data: {
      namespace: string
      name: string
      version: string
      segments: string[]
    }
  ): void {
    const matching = this.webhooks.filter(
      (wh) => wh.enabled && wh.events.includes(type)
    )

    if (matching.length === 0) {
      this.logger.debug({ event: type }, 'No webhooks for this event')
      return
    }

    const payload: RegistryEventPayload = {
      event: type,
      name: data.name,
      version: data.version,
      namespace: data.namespace,
      timestamp: new Date().toISOString(),
      path: `${data.namespace}/${data.segments.join('/')}/${data.version}`
    }

    for (const webhook of matching) {
      this.queue.push({
        webhook,
        payload,
        attempt: 0,
        maxAttempts: WEBHOOK_MAX_RETRIES,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      })
    }

    this.logger.info(
      { event: type, count: matching.length },
      'Webhooks enqueued'
    )
    void this.drain()
  }

  /**
   * Shut down the webhook service.
   *
   * Cancels the retry timer and discards pending jobs.
   * Call this during graceful shutdown to avoid dangling timers.
   */
  shutdown(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    const pending = this.queue.length
    this.queue = []

    if (pending > 0) {
      this.logger.warn({ pending }, 'Webhook queue discarded on shutdown')
    }
  }

  // ─── Validation ─────────────────────────────────────────────────────────

  /** Validate webhook config structure and return the webhooks array. */
  private validateConfig(config: WebhookConfigFile): WebhookConfig[] {
    if (!Array.isArray(config.webhooks)) {
      throw new Error('Invalid webhook config: missing webhooks array')
    }

    for (const wh of config.webhooks) {
      if (typeof wh.url !== 'string' || !wh.url)
        throw new Error('Webhook url is required')
      if (typeof wh.secret !== 'string' || !wh.secret)
        throw new Error('Webhook secret is required')
      if (!Array.isArray(wh.events))
        throw new Error('Webhook events must be an array')
      if (typeof wh.enabled !== 'boolean')
        throw new Error('Webhook enabled must be a boolean')
    }

    return config.webhooks
  }

  // ─── Queue ───────────────────────────────────────────────────────────────

  /**
   * Process jobs until the queue is empty or the next job is in the future.
   *
   * Flow:
   *   sort queue by time
   *     → not ready yet  → setTimeout(remaining ms), break
   *     → ready          → deliver()
   *       → 2xx          → done
   *       → fail + retries left → push back with delay (2s → 4s → 8s)
   *       → fail + no retries   → discard, log error
   */
  private async drain(): Promise<void> {
    if (this.processing) return

    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    this.processing = true

    try {
      while (this.queue.length > 0) {
        this.queue.sort(
          (a, b) =>
            (a.nextRetryAt?.getTime() ?? 0) - (b.nextRetryAt?.getTime() ?? 0)
        )

        const job = this.queue[0]
        const readyAt = job.nextRetryAt?.getTime() ?? 0

        if (readyAt > Date.now()) {
          this.timer = setTimeout(() => {
            this.timer = null
            void this.drain()
          }, readyAt - Date.now())
          break
        }

        this.queue.shift()

        const result = await this.deliver(job)

        if (result.success) continue

        if (job.attempt < job.maxAttempts) {
          job.nextRetryAt = new Date(
            Date.now() + WEBHOOK_BASE_DELAY_MS * Math.pow(2, job.attempt)
          )
          this.queue.push(job)
          this.logger.warn(
            { jobId: job.id, attempt: job.attempt, nextRetry: job.nextRetryAt },
            'Webhook failed, will retry'
          )
        } else {
          this.logger.error(
            { jobId: job.id, url: job.webhook.url, attempts: job.attempt },
            'Webhook failed after all retries'
          )
        }
      }
    } finally {
      this.processing = false
    }
  }

  // ─── Delivery ────────────────────────────────────────────────────────────

  /** Send a single webhook request with HMAC signature. */
  private async deliver(job: WebhookJob): Promise<WebhookDeliveryResult> {
    job.attempt++

    const body = JSON.stringify(job.payload)
    const hmac = createHmac('sha256', job.webhook.secret)
    hmac.update(body)
    const signature = `sha256=${hmac.digest('hex')}`

    try {
      const response = await fetch(job.webhook.url, {
        body,
        method: 'POST',
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
        headers: {
          'X-Webhook-Delivery': job.id,
          'X-Webhook-Signature': signature,
          'User-Agent': WEBHOOK_USER_AGENT,
          'Content-Type': 'application/json',
          'X-Webhook-Event': job.payload.event,
          'X-Webhook-Timestamp': job.payload.timestamp
        }
      })

      if (response.ok) {
        this.logger.info(
          { jobId: job.id, status: response.status },
          'Webhook delivered'
        )
        return {
          success: true,
          attempts: job.attempt,
          statusCode: response.status
        }
      }

      const text = await response.text().catch(() => '')
      this.logger.warn(
        { jobId: job.id, status: response.status, error: text },
        'Webhook got non-2xx'
      )

      return {
        success: false,
        attempts: job.attempt,
        statusCode: response.status,
        error: `HTTP ${response.status}: ${text}`
      }
    } catch (error) {
      const message = (error as Error).message
      this.logger.error(
        { jobId: job.id, error: message },
        'Webhook delivery exception'
      )

      return { success: false, error: message, attempts: job.attempt }
    }
  }
}
