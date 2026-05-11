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
    name: 'admin token on /registries/* (REVIEW §2.1 divergence)',
    path: REGISTRY_PATH,
    headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    expect: {
      server: {
        status: 401,
        code: 'INVALID_TOKEN',
        reason: 'REVIEW §2.1 — server does not bypass admin token on /registries/*'
      },
      worker: {
        status: 200,
        reason: 'REVIEW §2.1 — worker bypasses namespace auth when token equals ADMIN_TOKEN'
      }
    }
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
    name: 'percent-encoded @ in registry URL (REVIEW §2.2 divergence)',
    path: '/registries/%40rack/lib/1.0.0',
    headers: { authorization: `Bearer ${NS_TOKEN}` },
    expect: {
      server: {
        status: 200,
        reason: 'REVIEW §2.2 — Fastify decodes %40 in path params, so /%40rack matches /@rack'
      },
      worker: {
        status: 400,
        code: 'INVALID_PATH',
        reason: 'REVIEW §2.2 — Worker URL.pathname keeps %40 encoded; parser rejects'
      }
    }
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
  }
]

// ─── Runner ──────────────────────────────────────────────────────────

beforeEach(() => clearAuthCache())

function runCases(cases: ParityCase[]): void {
  it.each(cases)('$name', async (c) => {
    const [serverRes, workerRes] = await Promise.all([fireServer(c), fireWorker(c)])

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
  })
}

describe('Server ↔ Worker parity', () => {
  describe('protected namespace auth', () => runCases(authCases))
  describe('malformed registry URL', () => runCases(malformedCases))
  describe('endpoint status / body codes', () => runCases(endpointCases))
  describe('namespace listing', () => runCases(listingCases))
})
