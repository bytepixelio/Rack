import { it, expect, describe } from 'vitest'
import { callRegistry } from '../helpers/call.js'
import { createMockBucket } from '../helpers/mock-bucket.js'

const registryData = {
  name: 'node',
  version: '1.0.0',
  type: 'registry:runtime'
}

function bearer(token: string): Request {
  return new Request('http://localhost/', {
    headers: { authorization: `Bearer ${token}` }
  })
}

function xRegistry(token: string): Request {
  return new Request('http://localhost/', {
    headers: { 'x-registry-token': token }
  })
}

describe('worker auth enforcement', () => {
  describe('anonymous namespace', () => {
    it('allows access with no token', async () => {
      const bucket = createMockBucket(
        { '@pub/a/1.0.0/registry.json': registryData },
        { authConfig: { '@pub': [] } }
      )
      const res = await callRegistry(bucket, '@pub/a/1.0.0', {
        request: new Request('http://localhost/')
      })
      expect(res.status).toBe(200)
    })

    it('allows access with any token (token ignored)', async () => {
      const bucket = createMockBucket(
        { '@pub/a/1.0.0/registry.json': registryData },
        { authConfig: { '@pub': [] } }
      )
      const res = await callRegistry(bucket, '@pub/a/1.0.0', {
        request: bearer('whatever')
      })
      expect(res.status).toBe(200)
    })
  })

  describe('undeclared namespace', () => {
    it('returns 403 FORBIDDEN_NAMESPACE when namespace is not in auth.json', async () => {
      const bucket = createMockBucket({
        '@evil/a/1.0.0/registry.json': registryData
      })
      const res = await callRegistry(bucket, '@evil/a/1.0.0')
      expect(res.status).toBe(403)
      const body = (await res.json()) as { code: string }
      expect(body.code).toBe('FORBIDDEN_NAMESPACE')
    })

    it('returns 403 when .auth/auth.json is missing from R2', async () => {
      const bucket = createMockBucket(
        { '@rack/a/1.0.0/registry.json': registryData },
        { authConfig: null }
      )
      const res = await callRegistry(bucket, '@rack/a/1.0.0')
      expect(res.status).toBe(403)
    })
  })

  describe('gated namespace', () => {
    const authConfig = {
      '@priv': [{ token: 'secret', publish: true }]
    }

    it('returns 401 UNAUTHORIZED when no token supplied', async () => {
      const bucket = createMockBucket(
        { '@priv/a/1.0.0/registry.json': registryData },
        { authConfig }
      )
      const res = await callRegistry(bucket, '@priv/a/1.0.0')
      expect(res.status).toBe(401)
      const body = (await res.json()) as { code: string }
      expect(body.code).toBe('UNAUTHORIZED')
    })

    it('returns 401 INVALID_TOKEN for wrong token', async () => {
      const bucket = createMockBucket(
        { '@priv/a/1.0.0/registry.json': registryData },
        { authConfig }
      )
      const res = await callRegistry(bucket, '@priv/a/1.0.0', {
        request: bearer('wrong')
      })
      expect(res.status).toBe(401)
      const body = (await res.json()) as { code: string }
      expect(body.code).toBe('INVALID_TOKEN')
    })

    it('allows access with matching Bearer token', async () => {
      const bucket = createMockBucket(
        { '@priv/a/1.0.0/registry.json': registryData },
        { authConfig }
      )
      const res = await callRegistry(bucket, '@priv/a/1.0.0', {
        request: bearer('secret')
      })
      expect(res.status).toBe(200)
    })

    it('allows access with matching X-Registry-Token header', async () => {
      const bucket = createMockBucket(
        { '@priv/a/1.0.0/registry.json': registryData },
        { authConfig }
      )
      const res = await callRegistry(bucket, '@priv/a/1.0.0', {
        request: xRegistry('secret')
      })
      expect(res.status).toBe(200)
    })

    it('returns 401 TOKEN_EXPIRED for expired token', async () => {
      const bucket = createMockBucket(
        { '@priv/a/1.0.0/registry.json': registryData },
        {
          authConfig: {
            '@priv': [{ token: 'old', publish: true, expiresAt: '2020-01-01' }]
          }
        }
      )
      const res = await callRegistry(bucket, '@priv/a/1.0.0', {
        request: bearer('old')
      })
      expect(res.status).toBe(401)
      const body = (await res.json()) as { code: string }
      expect(body.code).toBe('TOKEN_EXPIRED')
    })
  })

  describe('admin token', () => {
    it('bypasses per-namespace auth on a gated namespace', async () => {
      const bucket = createMockBucket(
        { '@priv/a/1.0.0/registry.json': registryData },
        { authConfig: { '@priv': [{ token: 'other', publish: true }] } }
      )
      const res = await callRegistry(bucket, '@priv/a/1.0.0', {
        adminToken: 'admin-key',
        request: bearer('admin-key')
      })
      expect(res.status).toBe(200)
    })

    it('bypasses namespace-not-declared check', async () => {
      const bucket = createMockBucket({
        '@unknown/a/1.0.0/registry.json': registryData
      })
      const res = await callRegistry(bucket, '@unknown/a/1.0.0', {
        adminToken: 'admin-key',
        request: bearer('admin-key')
      })
      expect(res.status).toBe(200)
    })

    it('ignores admin token when the request token does not match', async () => {
      const bucket = createMockBucket(
        { '@priv/a/1.0.0/registry.json': registryData },
        { authConfig: { '@priv': [{ token: 'other', publish: true }] } }
      )
      const res = await callRegistry(bucket, '@priv/a/1.0.0', {
        adminToken: 'admin-key',
        request: bearer('not-admin')
      })
      expect(res.status).toBe(401)
    })
  })

  describe('cache', () => {
    it('caches the auth config across requests to the same bucket', async () => {
      let reads = 0
      const delegate = createMockBucket(
        { '@rack/a/1.0.0/registry.json': registryData },
        { authConfig: { '@rack': [] } }
      )
      const counting: R2Bucket = {
        ...delegate,
        get: async (key: string) => {
          if (key === '.auth/auth.json') reads++
          return delegate.get(key)
        }
      } as unknown as R2Bucket

      await callRegistry(counting, '@rack/a/1.0.0')
      await callRegistry(counting, '@rack/a/1.0.0')
      await callRegistry(counting, '@rack/a/1.0.0')

      expect(reads).toBe(1)
    })
  })
})
