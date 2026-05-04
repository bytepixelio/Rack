import { describe, it, expect } from 'vitest'
import { handleSchema } from '../../src/routes/schema.js'
import { createMockBucket } from '../helpers/mock-bucket.js'

describe('GET /schemas/:file', () => {
  it('should return whitelisted schema', async () => {
    const schemaData = { type: 'object' }
    const bucket = createMockBucket({
      'schema/rack.json': schemaData
    })
    const res = await handleSchema(bucket, 'rack.json')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(schemaData)
  })

  it('should return 404 for non-whitelisted schema', async () => {
    const bucket = createMockBucket({})
    const res = await handleSchema(bucket, 'evil.json')

    expect(res.status).toBe(404)
  })

  it('should return 404 when whitelisted but file missing in R2', async () => {
    const bucket = createMockBucket({})
    const res = await handleSchema(bucket, 'preset.json')

    expect(res.status).toBe(404)
  })
})
