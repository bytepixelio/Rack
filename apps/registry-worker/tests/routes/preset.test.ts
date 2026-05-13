import { it, expect, describe } from 'vitest'
import { handlePreset } from '../../src/routes/preset.js'
import { createMockBucket } from '../helpers/mock-bucket.js'

const presetData = { name: 'node', registries: ['runtimes/node'] }

describe('GET /presets/:name', () => {
  it('should return preset content', async () => {
    const bucket = createMockBucket({
      'presets/node/preset.json': presetData
    })
    const res = await handlePreset(bucket, 'node')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(presetData)
  })

  it('should return 404 for non-existent preset', async () => {
    const bucket = createMockBucket({})
    const res = await handlePreset(bucket, 'nonexistent')

    expect(res.status).toBe(404)
  })

  it('returns 400 INVALID_PRESET for decoded traversal (§6.21)', async () => {
    // The Worker dispatcher decodes %2e%2e%2fsecret to '../secret'
    // before calling the handler; the validator rejects it as a 400
    // instead of leaking the path into bucket.get and silently 404ing.
    const bucket = createMockBucket({})
    const res = await handlePreset(bucket, '../secret')

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      code: 'INVALID_PRESET',
      message: expect.stringContaining('Preset name must match')
    })
  })

  it('returns 400 INVALID_PRESET for an uppercase preset name', async () => {
    const bucket = createMockBucket({})
    const res = await handlePreset(bucket, 'Tutorial')

    expect(res.status).toBe(400)
    expect((await res.json()) as { code: string }).toMatchObject({
      code: 'INVALID_PRESET'
    })
  })
})
