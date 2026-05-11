import { it, expect, describe } from 'vitest'
import { handleHealth } from '../../src/routes/health.js'
import { createMockBucket } from '../helpers/mock-bucket.js'

describe('GET /health', () => {
  it('should return 200 when .healthcheck exists', async () => {
    const bucket = createMockBucket({ '.healthcheck': '' })
    const res = await handleHealth(bucket)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      status: 'ok',
      checks: { storage: { status: 'ok' } }
    })
  })

  it('should return 503 when .healthcheck is missing', async () => {
    const bucket = createMockBucket({})
    const res = await handleHealth(bucket)

    expect(res.status).toBe(503)
    const body = (await res.json()) as { status: string }
    expect(body.status).toBe('error')
  })
})
