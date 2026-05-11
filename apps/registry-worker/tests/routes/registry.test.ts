import { it, expect, describe } from 'vitest'
import { callRegistry } from '../helpers/call.js'
import { createMockBucket } from '../helpers/mock-bucket.js'

const registryData = {
  name: 'node',
  version: '1.0.0',
  type: 'registry:runtime'
}

describe('GET /registries/*', () => {
  describe('versions', () => {
    it('should return versions.json', async () => {
      const versionsData = { versions: ['1.0.0'] }
      const bucket = createMockBucket({
        '@rack/runtimes/node/versions.json': versionsData
      })
      const res = await callRegistry(bucket, '@rack/runtimes/node/versions')

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual(versionsData)
    })

    it('should return 404 when versions.json missing', async () => {
      const bucket = createMockBucket({})
      const res = await callRegistry(bucket, '@rack/node/versions')

      expect(res.status).toBe(404)
    })
  })

  describe('versioned', () => {
    it('should return specific version registry.json', async () => {
      const bucket = createMockBucket({
        '@rack/runtimes/node/1.0.0/registry.json': registryData
      })
      const res = await callRegistry(bucket, '@rack/runtimes/node/1.0.0')

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual(registryData)
    })

    it('should return 404 for non-existent version', async () => {
      const bucket = createMockBucket({})
      const res = await callRegistry(bucket, '@rack/node/9.9.9')

      expect(res.status).toBe(404)
    })
  })

  describe('latest', () => {
    it('should resolve latest version via versions.json', async () => {
      const bucket = createMockBucket({
        '@rack/node/versions.json': { versions: ['2.0.0', '1.0.0'] },
        '@rack/node/2.0.0/registry.json': { ...registryData, version: '2.0.0' }
      })
      const res = await callRegistry(bucket, '@rack/node')

      expect(res.status).toBe(200)
      const body = (await res.json()) as { version: string }
      expect(body.version).toBe('2.0.0')
    })

    it('should return 404 when versions.json missing', async () => {
      const bucket = createMockBucket({})
      const res = await callRegistry(bucket, '@rack/node')

      expect(res.status).toBe(404)
    })

    it('should return 404 when versions list is empty', async () => {
      const bucket = createMockBucket({
        '@rack/node/versions.json': { versions: [] }
      })
      const res = await callRegistry(bucket, '@rack/node')

      expect(res.status).toBe(404)
    })
  })

  describe('file', () => {
    it('should return template file', async () => {
      const bucket = createMockBucket({
        '@rack/node/1.0.0/templates/.gitignore': 'node_modules\n'
      })
      const res = await callRegistry(
        bucket,
        '@rack/node/1.0.0/files/templates/.gitignore'
      )

      expect(res.status).toBe(200)
    })

    it('should return 404 for missing file', async () => {
      const bucket = createMockBucket({})
      const res = await callRegistry(
        bucket,
        '@rack/node/1.0.0/files/missing.ts'
      )

      expect(res.status).toBe(404)
    })
  })

  describe('invalid paths', () => {
    it('should return 400 for invalid path', async () => {
      const bucket = createMockBucket({})
      const res = await callRegistry(bucket, 'node')

      expect(res.status).toBe(400)
    })
  })
})
