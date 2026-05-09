/**
 * Worker top-level routing tests.
 *
 * Exercises the percent-encoded namespace path that CLI sends to the
 * Worker (`rk list @rack` ⇒ `/namespaces/%40rack/registries`). The
 * route handlers expect a decoded `@`-prefixed namespace, so the
 * Worker entry must `decodeURIComponent` before dispatching.
 */

import worker from '../src/index.js'
import { describe, it, expect } from 'vitest'
import { createMockBucket } from './helpers/mock-bucket.js'

interface Env {
  BUCKET: R2Bucket
  ADMIN_TOKEN?: string
}

function fire(env: Env, url: string, init: RequestInit = {}): Promise<Response> {
  // Cloudflare Worker fetch handlers receive (request, env, ctx). Our
  // worker only reads `request` and `env`.
  return worker.fetch(
    new Request(url, init),
    env,
    {} as ExecutionContext
  )
}

describe('Worker top-level routing', () => {
  it('decodes %40 in /namespaces/:namespace/registries', async () => {
    const bucket = createMockBucket({
      '@rack/lib/versions.json': { versions: ['1.0.0'] }
    })

    const res = await fire(
      { BUCKET: bucket },
      'https://w.example.com/namespaces/%40rack/registries'
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      namespace: string
      registries: string[]
    }
    expect(body.namespace).toBe('@rack')
    expect(body.registries).toContain('lib')
  })

  it('returns 400 for malformed percent encoding in namespace', async () => {
    const bucket = createMockBucket({})

    const res = await fire(
      { BUCKET: bucket },
      'https://w.example.com/namespaces/%E0%A4%A/registries'
    )

    expect(res.status).toBe(400)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe('INVALID_NAMESPACE')
  })

  it('rejects non-GET/HEAD methods', async () => {
    const bucket = createMockBucket({})

    const res = await fire(
      { BUCKET: bucket },
      'https://w.example.com/namespaces',
      { method: 'POST' }
    )

    expect(res.status).toBe(405)
  })

  it('returns 404 for unknown route', async () => {
    const bucket = createMockBucket({})

    const res = await fire(
      { BUCKET: bucket },
      'https://w.example.com/unknown'
    )

    expect(res.status).toBe(404)
  })
})
