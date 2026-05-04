import { describe, it, expect } from 'vitest'
import {
  handleNamespaces,
  handleNamespaceRegistries
} from '../../src/routes/namespace.js'
import { createMockBucket } from '../helpers/mock-bucket.js'

describe('GET /namespaces', () => {
  it('should list namespaces starting with @', async () => {
    const bucket = createMockBucket({
      '@rack/runtimes/node/versions.json': { versions: ['1.0.0'] },
      'presets/node/preset.json': { name: 'node' }
    })
    const res = await handleNamespaces(bucket)

    expect(res.status).toBe(200)
    const body = (await res.json()) as { namespaces: string[] }
    expect(body.namespaces).toEqual(['@rack'])
  })

  it('should return empty when no namespaces', async () => {
    const bucket = createMockBucket({
      'presets/node/preset.json': { name: 'node' }
    })
    const res = await handleNamespaces(bucket)

    expect(res.status).toBe(200)
    const body = (await res.json()) as { namespaces: string[] }
    expect(body.namespaces).toEqual([])
  })
})

describe('GET /namespaces/:namespace/registries', () => {
  it('should list registries in a namespace', async () => {
    const bucket = createMockBucket({
      '@rack/runtimes/node/versions.json': { versions: ['1.0.0'] },
      '@rack/quality/eslint/versions.json': { versions: ['1.0.0'] }
    })
    const res = await handleNamespaceRegistries(bucket, '@rack')

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      namespace: string
      registries: string[]
    }
    expect(body.namespace).toBe('@rack')
    expect(body.registries).toEqual(['quality/eslint', 'runtimes/node'])
  })

  it('should return 400 for namespace without @', async () => {
    const bucket = createMockBucket({})
    const res = await handleNamespaceRegistries(bucket, 'rack')

    expect(res.status).toBe(400)
  })
})
