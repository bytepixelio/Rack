/**
 * Server ↔ Worker read-API parity matrix.
 *
 * Fires identical requests at the Fastify server (`app.inject`) and the
 * Cloudflare Worker (`worker.fetch`) and asserts each returns the
 * expected status + error code. Locks in current behavior so future
 * changes that drift one runtime but not the other are caught at PR
 * time.
 *
 * Cases mirror REVIEW.md §5.3:
 * - Protected namespace: missing / wrong / namespace / admin token.
 * - Malformed registry URL: invalid namespace, empty file path, encoded `@`.
 * - latest / versioned / files / versions status & body codes.
 * - Namespace listing.
 *
 * Known divergences carry per-runtime expectations with a `reason`
 * pointing at the REVIEW.md section that documents them — either
 * runtime regressing on the documented side will still fail the test.
 */

import { it, expect, describe, beforeEach } from 'vitest'

import { clearAuthCache } from '../../registry-worker/src/lib/auth.js'
import {
  NS_TOKEN,
  fireServer,
  fireWorker,
  ADMIN_TOKEN,
  serverExpect,
  workerExpect
} from '../src/parity.js'

import type { ParityCase } from '../src/parity.js'

const REGISTRY_PATH = '/registries/@rack/lib/1.0.0'

// ─── Auth cases ──────────────────────────────────────────────────────

const authCases: ParityCase[] = [
  {
    name: 'missing token on protected namespace → 401 UNAUTHORIZED',
    path: REGISTRY_PATH,
    expect: { status: 401, code: 'UNAUTHORIZED' }
  },
  {
    name: 'wrong bearer token → 401 INVALID_TOKEN',
    path: REGISTRY_PATH,
    headers: { authorization: 'Bearer wrong-token' },
    expect: { status: 401, code: 'INVALID_TOKEN' }
  },
  {
    name: 'valid namespace token via Authorization → 200',
    path: REGISTRY_PATH,
    headers: { authorization: `Bearer ${NS_TOKEN}` },
    expect: { status: 200 }
  },
  {
    name: 'valid namespace token via X-Registry-Token → 200',
    path: REGISTRY_PATH,
    headers: { 'x-registry-token': NS_TOKEN },
    expect: { status: 200 }
  },
  {
    name: 'admin token on /registries/* → 200 (REVIEW §2.1 resolved)',
    path: REGISTRY_PATH,
    headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    expect: { status: 200 }
  },
  {
    name: 'namespace not in allowlist → 403 FORBIDDEN_NAMESPACE',
    path: '/registries/@evil/lib/1.0.0',
    headers: { authorization: `Bearer ${NS_TOKEN}` },
    expect: { status: 403, code: 'FORBIDDEN_NAMESPACE' }
  }
]

// ─── Malformed URL cases ─────────────────────────────────────────────

const malformedCases: ParityCase[] = [
  {
    name: 'no @ prefix → 400 INVALID_PATH',
    path: '/registries/rack/lib/1.0.0',
    headers: { authorization: `Bearer ${NS_TOKEN}` },
    expect: { status: 400, code: 'INVALID_PATH' }
  },
  {
    name: 'namespace only, no path → 400 INVALID_PATH',
    path: '/registries/@rack',
    headers: { authorization: `Bearer ${NS_TOKEN}` },
    expect: { status: 400, code: 'INVALID_PATH' }
  },
  {
    name: 'files prefix without file path → 400 INVALID_PATH',
    path: '/registries/@rack/lib/1.0.0/files',
    headers: { authorization: `Bearer ${NS_TOKEN}` },
    expect: { status: 400, code: 'INVALID_PATH' }
  },
  {
    name: 'percent-encoded @ in registry URL → 200 on both',
    path: '/registries/%40rack/lib/1.0.0',
    headers: { authorization: `Bearer ${NS_TOKEN}` },
    expect: { status: 200 }
  },
  {
    name: 'traversal segment in registry URL → 400 INVALID_PATH',
    path: '/registries/@rack/%2E%2E/lib/1.0.0',
    headers: { authorization: `Bearer ${NS_TOKEN}` },
    expect: { status: 400, code: 'INVALID_PATH' }
  },
  {
    name: 'uppercase namespace → 400 INVALID_PATH',
    path: '/registries/@Rack/lib/1.0.0',
    headers: { authorization: `Bearer ${NS_TOKEN}` },
    expect: { status: 400, code: 'INVALID_PATH' }
  },
  {
    name: 'uppercase path segment → 400 INVALID_PATH',
    path: '/registries/@rack/Lib/1.0.0',
    headers: { authorization: `Bearer ${NS_TOKEN}` },
    expect: { status: 400, code: 'INVALID_PATH' }
  }
]

// ─── Endpoint status / body code cases ───────────────────────────────

const endpointCases: ParityCase[] = [
  {
    name: 'GET versions → 200',
    path: '/registries/@rack/lib/versions',
    headers: { authorization: `Bearer ${NS_TOKEN}` },
    expect: { status: 200 }
  },
  {
    name: 'GET versioned (existing) → 200',
    path: REGISTRY_PATH,
    headers: { authorization: `Bearer ${NS_TOKEN}` },
    expect: { status: 200 }
  },
  {
    name: 'GET versioned (missing version) → 404 NOT_FOUND',
    path: '/registries/@rack/lib/9.9.9',
    headers: { authorization: `Bearer ${NS_TOKEN}` },
    expect: { status: 404, code: 'NOT_FOUND' }
  },
  {
    name: 'GET latest (missing registry) → 404 NOT_FOUND',
    path: '/registries/@rack/missing',
    headers: { authorization: `Bearer ${NS_TOKEN}` },
    expect: { status: 404, code: 'NOT_FOUND' }
  },
  {
    name: 'GET latest (empty versions.json) → 404 NOT_FOUND',
    path: '/registries/@rack/empty',
    headers: { authorization: `Bearer ${NS_TOKEN}` },
    seed: {
      authConfig: { '@rack': [{ token: NS_TOKEN }] },
      files: { '@rack/empty/versions.json': { versions: [] } }
    },
    expect: { status: 404, code: 'NOT_FOUND' }
  },
  {
    name: 'GET files (missing file) → 404 NOT_FOUND',
    path: '/registries/@rack/lib/1.0.0/files/no.txt',
    headers: { authorization: `Bearer ${NS_TOKEN}` },
    expect: { status: 404, code: 'NOT_FOUND' }
  },
  {
    name: 'GET file (existing template) → 200',
    path: '/registries/@rack/lib/1.0.0/files/templates/.gitignore',
    headers: { authorization: `Bearer ${NS_TOKEN}` },
    expect: { status: 200 }
  }
]

// ─── Content-Type parity (§6.17) ─────────────────────────────────────

// Storage keys omit the `/files/` URL prefix — the route maps
// `/registries/@ns/path/ver/files/<rel>` to the bare `@ns/path/ver/<rel>`
// key in both runtimes.
const TS_SEED = {
  authConfig: { '@rack': [{ token: NS_TOKEN }] },
  files: {
    '@rack/lib/versions.json': { versions: ['1.0.0'] },
    '@rack/lib/1.0.0/registry.json': { name: '@rack/lib', version: '1.0.0' },
    '@rack/lib/1.0.0/src/index.ts': 'export const x = 1\n',
    '@rack/lib/1.0.0/src/App.tsx': 'export const App = () => null\n',
    '@rack/lib/1.0.0/src/app.jsx': 'export const App = () => null\n'
  }
}

const mimeParityCases: ParityCase[] = [
  {
    name: 'GET .ts file → Content-Type text/typescript',
    path: '/registries/@rack/lib/1.0.0/files/src/index.ts',
    headers: { authorization: `Bearer ${NS_TOKEN}` },
    seed: TS_SEED,
    expect: {
      status: 200,
      headers: { 'content-type': 'text/typescript' }
    }
  },
  {
    name: 'GET .tsx file → Content-Type text/typescript',
    path: '/registries/@rack/lib/1.0.0/files/src/App.tsx',
    headers: { authorization: `Bearer ${NS_TOKEN}` },
    seed: TS_SEED,
    expect: {
      status: 200,
      headers: { 'content-type': 'text/typescript' }
    }
  },
  {
    name: 'GET .jsx file → Content-Type text/javascript',
    path: '/registries/@rack/lib/1.0.0/files/src/app.jsx',
    headers: { authorization: `Bearer ${NS_TOKEN}` },
    seed: TS_SEED,
    expect: {
      status: 200,
      headers: { 'content-type': 'text/javascript' }
    }
  }
]

// ─── Preset cases (§6.21) ────────────────────────────────────────────

const PRESET_SEED = {
  authConfig: { '@rack': [] },
  files: {
    'presets/tutorial/preset.json': {
      name: 'tutorial',
      version: '1.0.0',
      registries: ['runtimes/node']
    }
  }
}

const presetCases: ParityCase[] = [
  {
    name: 'GET /presets/<existing> → 200',
    path: '/presets/tutorial',
    seed: PRESET_SEED,
    expect: { status: 200 }
  },
  {
    name: 'GET /presets/<missing> → 404 NOT_FOUND',
    path: '/presets/missing',
    seed: PRESET_SEED,
    expect: { status: 404, code: 'NOT_FOUND' }
  },
  {
    name: 'GET /presets/<encoded-traversal> → 400 INVALID_PRESET',
    // %2e%2e%2fsecret decodes to ../secret. Server validator (after
    // Fastify decode) and Worker validator (after dispatcher decode)
    // both reject this with 400 instead of letting the path leak into
    // the storage layer.
    path: '/presets/%2e%2e%2fsecret',
    seed: PRESET_SEED,
    expect: { status: 400, code: 'INVALID_PRESET' }
  },
  {
    name: 'GET /presets/<uppercase> → 400 INVALID_PRESET',
    path: '/presets/Tutorial',
    seed: PRESET_SEED,
    expect: { status: 400, code: 'INVALID_PRESET' }
  }
]

// ─── Namespace listing cases ─────────────────────────────────────────

const listingCases: ParityCase[] = [
  {
    name: 'list registries with valid token → 200',
    path: '/namespaces/@rack/registries',
    headers: { authorization: `Bearer ${NS_TOKEN}` },
    expect: { status: 200 }
  },
  {
    name: 'list registries without token → 401 UNAUTHORIZED',
    path: '/namespaces/@rack/registries',
    expect: { status: 401, code: 'UNAUTHORIZED' }
  },
  {
    name: 'list registries for namespace not starting with @ → 400 INVALID_NAMESPACE',
    path: '/namespaces/rack/registries',
    headers: { authorization: `Bearer ${NS_TOKEN}` },
    expect: { status: 400, code: 'INVALID_NAMESPACE' }
  },
  {
    name: 'list registries for uppercase namespace → 400 INVALID_NAMESPACE (§6.24)',
    // Pre-§6.24 the route only checked startsWith('@'), so `@Rack`
    // slipped past and surfaced as 403/404/500 depending on auth and
    // storage state.
    path: '/namespaces/%40Rack/registries',
    headers: { authorization: `Bearer ${NS_TOKEN}` },
    expect: { status: 400, code: 'INVALID_NAMESPACE' }
  },
  {
    name: 'list registries for namespace with trailing underscore → 400',
    path: '/namespaces/%40bad_/registries',
    headers: { authorization: `Bearer ${NS_TOKEN}` },
    expect: { status: 400, code: 'INVALID_NAMESPACE' }
  }
]

// ─── Runner ──────────────────────────────────────────────────────────

beforeEach(() => clearAuthCache())

function runCases(cases: ParityCase[]): void {
  it.each(cases)('$name', async (c) => {
    const [serverRes, workerRes] = await Promise.all([
      fireServer(c),
      fireWorker(c)
    ])

    const sExp = serverExpect(c)
    const wExp = workerExpect(c)

    expect(serverRes.statusCode, 'server status').toBe(sExp.status)
    expect(workerRes.status, 'worker status').toBe(wExp.status)

    if (sExp.code) {
      expect(serverRes.json().code, 'server body.code').toBe(sExp.code)
    }
    if (wExp.code) {
      const body = (await workerRes.json()) as { code?: string }
      expect(body.code, 'worker body.code').toBe(wExp.code)
    }

    if (sExp.headers) {
      for (const [name, value] of Object.entries(sExp.headers)) {
        const key = name.toLowerCase()
        const got = serverRes.headers[key]
        // Fastify's `Content-Type` may carry `; charset=utf-8`; match
        // on the media-type prefix so the parity contract stays tight
        // without coupling to charset defaults.
        const actual = Array.isArray(got) ? got[0] : got
        expect(actual ?? '', `server header ${name}`).toMatch(
          new RegExp(`^${escapeRegExp(value)}(?:;|$)`)
        )
      }
    }
    if (wExp.headers) {
      for (const [name, value] of Object.entries(wExp.headers)) {
        const actual = workerRes.headers.get(name) ?? ''
        expect(actual, `worker header ${name}`).toMatch(
          new RegExp(`^${escapeRegExp(value)}(?:;|$)`)
        )
      }
    }
  })
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

describe('Server ↔ Worker parity', () => {
  describe('protected namespace auth', () => runCases(authCases))
  describe('malformed registry URL', () => runCases(malformedCases))
  describe('endpoint status / body codes', () => runCases(endpointCases))
  describe('template Content-Type parity', () => runCases(mimeParityCases))
  describe('preset routes', () => runCases(presetCases))
  describe('namespace listing', () => runCases(listingCases))

  describe('namespace pagination (§6.18)', () => {
    // Body-level case: the matrix runner only checks status/code, but
    // here we need to compare the full `namespaces` array because the
    // bug returned the wrong *content*, not the wrong status. Force
    // the Worker mock to paginate at 2 entries/page so a 4-namespace
    // bucket needs a cursor walk to surface every entry.
    const PAGINATED_SEED = {
      authConfig: {
        '@a': [],
        '@b': [],
        '@c': [],
        '@d': []
      },
      files: {
        '@a/lib/versions.json': { versions: ['1.0.0'] },
        '@b/lib/versions.json': { versions: ['1.0.0'] },
        '@c/lib/versions.json': { versions: ['1.0.0'] },
        '@d/lib/versions.json': { versions: ['1.0.0'] }
      }
    }

    it('Worker walks cursor pages and matches Server result', async () => {
      const c: ParityCase = {
        name: 'paginated /namespaces',
        path: '/namespaces',
        seed: PAGINATED_SEED,
        workerListPageSize: 2,
        expect: { status: 200 }
      }

      const [serverRes, workerRes] = await Promise.all([
        fireServer(c),
        fireWorker(c)
      ])
      expect(serverRes.statusCode).toBe(200)
      expect(workerRes.status).toBe(200)

      const serverBody = serverRes.json() as { namespaces: string[] }
      const workerBody = (await workerRes.json()) as { namespaces: string[] }

      const expected = ['@a', '@b', '@c', '@d']
      expect(serverBody.namespaces.sort()).toEqual(expected)
      expect(workerBody.namespaces.sort()).toEqual(expected)
    })
  })
})
