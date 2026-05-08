import { beforeEach } from 'vitest'
import { describe, it, expect } from 'vitest'
import { clearAuthCache } from '../../src/lib/auth.js'
import { createMockBucket } from '../helpers/mock-bucket.js'
import {
  handleNamespaces,
  handleNamespaceRegistries
} from '../../src/routes/namespace.js'

function mockRequest(token?: string): Request {
  const headers = new Headers()
  if (token) headers.set('authorization', `Bearer ${token}`)
  return new Request('https://test.example.com', { headers })
}

beforeEach(() => clearAuthCache())

describe('GET /namespaces', () => {
  it('lists only anonymous namespaces when no token is provided', async () => {
    const bucket = createMockBucket(
      {
        '@rack/runtimes/node/versions.json': { versions: ['1.0.0'] },
        '@secret/infra/deploy/versions.json': { versions: ['1.0.0'] }
      },
      { authConfig: { '@rack': [], '@secret': [{ token: 'tok-s' }] } }
    )
    const res = await handleNamespaces(bucket, undefined, mockRequest())

    expect(res.status).toBe(200)
    const body = (await res.json()) as { namespaces: string[] }
    expect(body.namespaces).toEqual(['@rack'])
  })

  it('includes token-gated namespace when correct token is provided', async () => {
    const bucket = createMockBucket(
      {
        '@rack/runtimes/node/versions.json': { versions: ['1.0.0'] },
        '@secret/infra/deploy/versions.json': { versions: ['1.0.0'] }
      },
      { authConfig: { '@rack': [], '@secret': [{ token: 'tok-s' }] } }
    )
    const res = await handleNamespaces(bucket, undefined, mockRequest('tok-s'))

    expect(res.status).toBe(200)
    const body = (await res.json()) as { namespaces: string[] }
    expect(body.namespaces).toContain('@rack')
    expect(body.namespaces).toContain('@secret')
  })

  it('shows all namespaces when admin token is provided', async () => {
    const bucket = createMockBucket(
      {
        '@rack/runtimes/node/versions.json': { versions: ['1.0.0'] },
        '@secret/infra/deploy/versions.json': { versions: ['1.0.0'] }
      },
      { authConfig: { '@rack': [], '@secret': [{ token: 'tok-s' }] } }
    )
    const res = await handleNamespaces(
      bucket,
      'admin-master',
      mockRequest('admin-master')
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { namespaces: string[] }
    expect(body.namespaces).toContain('@rack')
    expect(body.namespaces).toContain('@secret')
  })

  it('returns empty when no namespaces exist', async () => {
    const bucket = createMockBucket({
      'presets/node/preset.json': { name: 'node' }
    })
    const res = await handleNamespaces(bucket, undefined, mockRequest())

    expect(res.status).toBe(200)
    const body = (await res.json()) as { namespaces: string[] }
    expect(body.namespaces).toEqual([])
  })
})

describe('GET /namespaces/:namespace/registries', () => {
  it('lists registries for an anonymous namespace', async () => {
    const bucket = createMockBucket({
      '@rack/runtimes/node/versions.json': { versions: ['1.0.0'] },
      '@rack/quality/eslint/versions.json': { versions: ['1.0.0'] }
    })
    const res = await handleNamespaceRegistries(
      bucket,
      undefined,
      mockRequest(),
      '@rack'
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      namespace: string
      registries: string[]
    }
    expect(body.namespace).toBe('@rack')
    expect(body.registries).toEqual(['quality/eslint', 'runtimes/node'])
  })

  it('returns 401 for token-gated namespace without token', async () => {
    const bucket = createMockBucket(
      { '@secret/infra/deploy/versions.json': { versions: ['1.0.0'] } },
      { authConfig: { '@rack': [], '@secret': [{ token: 'tok-s' }] } }
    )
    const res = await handleNamespaceRegistries(
      bucket,
      undefined,
      mockRequest(),
      '@secret'
    )

    expect(res.status).toBe(401)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe('UNAUTHORIZED')
  })

  it('lists registries for token-gated namespace with correct token', async () => {
    const bucket = createMockBucket(
      { '@secret/infra/deploy/versions.json': { versions: ['1.0.0'] } },
      { authConfig: { '@rack': [], '@secret': [{ token: 'tok-s' }] } }
    )
    const res = await handleNamespaceRegistries(
      bucket,
      undefined,
      mockRequest('tok-s'),
      '@secret'
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { registries: string[] }
    expect(body.registries).toContain('infra/deploy')
  })

  it('lists registries for token-gated namespace with admin token', async () => {
    const bucket = createMockBucket(
      { '@secret/infra/deploy/versions.json': { versions: ['1.0.0'] } },
      { authConfig: { '@rack': [], '@secret': [{ token: 'tok-s' }] } }
    )
    const res = await handleNamespaceRegistries(
      bucket,
      'admin-master',
      mockRequest('admin-master'),
      '@secret'
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { registries: string[] }
    expect(body.registries).toContain('infra/deploy')
  })

  it('returns 404 for non-existent namespace', async () => {
    const bucket = createMockBucket({}, { authConfig: { '@nonexistent': [] } })
    const res = await handleNamespaceRegistries(
      bucket,
      undefined,
      mockRequest(),
      '@nonexistent'
    )

    expect(res.status).toBe(404)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe('NAMESPACE_NOT_FOUND')
  })

  it('returns 400 for namespace without @', async () => {
    const bucket = createMockBucket({})
    const res = await handleNamespaceRegistries(
      bucket,
      undefined,
      mockRequest(),
      'rack'
    )

    expect(res.status).toBe(400)
  })

  it('returns 403 for namespace not declared in auth.json', async () => {
    const bucket = createMockBucket(
      { '@unknown/lib/versions.json': { versions: ['1.0.0'] } },
      { authConfig: { '@rack': [] } }
    )
    const res = await handleNamespaceRegistries(
      bucket,
      undefined,
      mockRequest(),
      '@unknown'
    )

    expect(res.status).toBe(403)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe('FORBIDDEN_NAMESPACE')
  })
})
