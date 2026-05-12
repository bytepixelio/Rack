/**
 * Worker top-level routing tests.
 *
 * Exercises the percent-encoded namespace path that CLI sends to the
 * Worker (`rk list @rack` ⇒ `/namespaces/%40rack/registries`). The
 * route handlers expect a decoded `@`-prefixed namespace, so the
 * Worker entry must `decodeURIComponent` before dispatching.
 */

import worker from '../src/index.js'
import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest'
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

  it('decodes %40 in /registries/* wildcard', async () => {
    const bucket = createMockBucket({
      '@rack/lib/1.0.0/registry.json': { name: 'lib', version: '1.0.0' }
    })

    const res = await fire(
      { BUCKET: bucket },
      'https://w.example.com/registries/%40rack/lib/1.0.0'
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { name: string }
    expect(body.name).toBe('lib')
  })

  it('returns 400 INVALID_PATH for malformed encoding in /registries/*', async () => {
    const bucket = createMockBucket({})

    const res = await fire(
      { BUCKET: bucket },
      'https://w.example.com/registries/%E0%A4%A/lib/1.0.0'
    )

    expect(res.status).toBe(400)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe('INVALID_PATH')
  })

  it('rejects traversal segment in /registries/* with 400 INVALID_PATH', async () => {
    const bucket = createMockBucket({})

    const res = await fire(
      { BUCKET: bucket },
      'https://w.example.com/registries/@rack/%2E%2E/lib/1.0.0'
    )

    expect(res.status).toBe(400)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe('INVALID_PATH')
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

  describe('global error handler', () => {
    // Bucket whose every read rejects — simulates R2 platform errors that
    // the registry-server's Fastify error plugin would otherwise translate
    // into a Rack-shaped JSON 500. Without the top-level try/catch the
    // Worker would let the rejection bubble back to the Cloudflare runtime,
    // breaking protocol parity.
    const bucketThatRejects = (): R2Bucket =>
      ({
        get: async () => {
          throw new Error('R2 unavailable')
        },
        head: async () => {
          throw new Error('R2 unavailable')
        },
        list: async () => {
          throw new Error('R2 unavailable')
        },
        put: async () => null,
        delete: async () => {}
      }) as unknown as R2Bucket

    // Silence the `console.error('Worker dispatch failed:', …)` that the
    // top-level catch in src/index.ts emits — these cases intentionally
    // provoke that branch, so the stderr is expected noise, not signal.
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
    })
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('returns 500 INTERNAL_SERVER_ERROR when R2 throws on a registry read', async () => {
      const res = await fire(
        { BUCKET: bucketThatRejects() },
        'https://w.example.com/registries/@rack/lib/1.0.0'
      )

      expect(res.status).toBe(500)
      const body = (await res.json()) as { code: string; message: string }
      expect(body.code).toBe('INTERNAL_SERVER_ERROR')
      expect(body.message).toBe('Internal server error')
      expect(res.headers.get('content-type')).toBe('application/json')
      expect(res.headers.get('cache-control')).toBe('no-store')
    })

    it('returns 500 INTERNAL_SERVER_ERROR when /namespaces listing throws', async () => {
      const res = await fire(
        { BUCKET: bucketThatRejects() },
        'https://w.example.com/namespaces'
      )

      expect(res.status).toBe(500)
      const body = (await res.json()) as { code: string }
      expect(body.code).toBe('INTERNAL_SERVER_ERROR')
    })

    it('returns 500 INTERNAL_SERVER_ERROR when versions.json is corrupt JSON', async () => {
      // R2 returns an object but obj.json() throws on parse — exactly what
      // the registry-server's error plugin catches via its global handler.
      const bucket = createMockBucket({
        '@rack/lib/versions.json': '{ not valid json'
      })

      const res = await fire(
        { BUCKET: bucket },
        'https://w.example.com/registries/@rack/lib'
      )

      expect(res.status).toBe(500)
      const body = (await res.json()) as { code: string }
      expect(body.code).toBe('INTERNAL_SERVER_ERROR')
      expect(res.headers.get('cache-control')).toBe('no-store')
    })

    it('strips body for HEAD on 500 responses', async () => {
      const head = await fire(
        { BUCKET: bucketThatRejects() },
        'https://w.example.com/registries/@rack/lib/1.0.0',
        { method: 'HEAD' }
      )

      expect(head.status).toBe(500)
      expect(await head.text()).toBe('')
    })
  })
})
