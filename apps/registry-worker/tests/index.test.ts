/**
 * Worker top-level routing tests.
 *
 * Exercises the percent-encoded namespace path that CLI sends to the
 * Worker (`rk list @rack` ⇒ `/namespaces/%40rack/registries`). The
 * route handlers expect a decoded `@`-prefixed namespace, so the
 * Worker entry must `decodeURIComponent` before dispatching.
 */

import worker from '../src/index.js'
import { it, expect, describe } from 'vitest'
import { createMockBucket } from './helpers/mock-bucket.js'

interface Env {
  BUCKET: R2Bucket
  ADMIN_TOKEN?: string
}

function fire(
  env: Env,
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  // The Worker's fetch handler is declared as (request, env) — the
  // Cloudflare runtime passes a third `ctx` arg but our handler does
  // not read it, so the inferred signature only takes two.
  return worker.fetch(new Request(url, init), env)
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

    const res = await fire({ BUCKET: bucket }, 'https://w.example.com/unknown')

    expect(res.status).toBe(404)
  })

  it('strips body for HEAD on registry resource responses', async () => {
    const bucket = createMockBucket({
      '@rack/lib/1.0.0/registry.json': { name: 'lib', version: '1.0.0' }
    })

    const head = await fire(
      { BUCKET: bucket },
      'https://w.example.com/registries/@rack/lib/1.0.0',
      { method: 'HEAD' }
    )
    const get = await fire(
      { BUCKET: bucket },
      'https://w.example.com/registries/@rack/lib/1.0.0'
    )

    expect(head.status).toBe(get.status)
    expect(head.headers.get('content-type')).toBe(
      get.headers.get('content-type')
    )
    // Body must be empty — `await response.text()` on a HEAD-stripped
    // response yields '' even though the headers still describe the
    // underlying file.
    expect(await head.text()).toBe('')
  })

  it('strips body for HEAD on JSON listings', async () => {
    const bucket = createMockBucket({
      '@rack/lib/versions.json': { versions: ['1.0.0'] }
    })

    const head = await fire(
      { BUCKET: bucket },
      'https://w.example.com/namespaces/%40rack/registries',
      { method: 'HEAD' }
    )

    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
  })
})
