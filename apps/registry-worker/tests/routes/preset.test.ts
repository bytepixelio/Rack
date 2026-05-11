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
})
