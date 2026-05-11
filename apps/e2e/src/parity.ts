/**
 * Server ↔ Worker parity test infrastructure.
 *
 * Seeds the same storage spec into both runtimes (Fastify storage root
 * on a temp dir and a Map-backed Worker R2 bucket), exposes `fireServer`
 * and `fireWorker` so a single `ParityCase` can be fed into both with
 * one call, and provides the expectation resolver used by the matrix
 * test. Keeping the helpers out of the test file lets the test stay a
 * flat list of cases.
 */

import path from 'node:path'
import { tmpdir } from 'node:os'
import { rm, mkdir, mkdtemp, writeFile } from 'node:fs/promises'

import { buildApp } from '../../registry-server/src/app.js'
import worker from '../../registry-worker/src/index.js'

import type { Config } from '../../registry-server/src/types.js'

/** Fastify `inject` response — inferred so we don't need to depend on `fastify` directly. */
type InjectResponse = Awaited<
  ReturnType<Awaited<ReturnType<typeof buildApp>>['inject']>
>

// ─── Types ────────────────────────────────────────────────────────────

/** Storage seed shared by both runtimes. */
export interface SeedSpec {
  /** Mirrors `config/auth.json`. */
  authConfig: Record<string, Array<{ token: string; publish?: boolean }>>
  /** Object keys → JSON value or raw string body. */
  files: Record<string, unknown>
}

/** Expected response — `code` only checked when supplied. */
export interface Expectation {
  status: number
  code?: string
}

/**
 * Per-runtime expectation override for known divergences.
 * `reason` must reference the REVIEW.md section that documents the split
 * so the test stays self-explanatory.
 */
export interface SplitExpectation {
  server: Expectation & { reason: string }
  worker: Expectation & { reason: string }
}

/** A single matrix case. */
export interface ParityCase {
  name: string
  /** URL path including leading `/` (e.g. `/registries/@rack/lib/1.0.0`). */
  path: string
  /** Request headers — case-insensitive on both runtimes. */
  headers?: Record<string, string>
  /** Either shared (`Expectation`) or a `SplitExpectation` per runtime. */
  expect: Expectation | SplitExpectation
  /** Overrides `DEFAULT_SEED`. */
  seed?: SeedSpec
  /** ADMIN_TOKEN supplied to both runtimes. Defaults to `admin-token`. */
  adminToken?: string
}

interface Env {
  BUCKET: R2BucketLike
  ADMIN_TOKEN?: string
}

/** Subset of `R2Bucket` the read-only routes use. */
interface R2BucketLike {
  get: (key: string) => Promise<R2ObjectBodyLike | null>
  head: (key: string) => Promise<R2ObjectLike | null>
  list: (options?: {
    prefix?: string
    delimiter?: string
    cursor?: string
    limit?: number
  }) => Promise<R2ListResultLike>
}

interface R2ObjectBodyLike {
  key: string
  size: number
  etag: string
  body: ReadableStream
  json: <T>() => Promise<T>
}

interface R2ObjectLike {
  key: string
  size: number
  etag: string
}

interface R2ListResultLike {
  objects: R2ObjectLike[]
  truncated: boolean
  delimitedPrefixes: string[]
  cursor?: string
}

// ─── Constants ────────────────────────────────────────────────────────

export const NS_TOKEN = 'ns-token'
export const ADMIN_TOKEN = 'admin-token'

/** Single registry under `@rack/lib@1.0.0` with one template file. */
export const DEFAULT_SEED: SeedSpec = {
  authConfig: { '@rack': [{ token: NS_TOKEN }] },
  files: {
    '@rack/lib/versions.json': { versions: ['1.0.0'] },
    '@rack/lib/1.0.0/registry.json': { name: '@rack/lib', version: '1.0.0' },
    '@rack/lib/1.0.0/templates/.gitignore': 'node_modules\n'
  }
}

// ─── Server seeding ──────────────────────────────────────────────────

/** Materialize a seed onto a temp dir + return the Fastify `Config`. */
export async function seedServer(
  spec: SeedSpec,
  adminToken: string
): Promise<{ tempDir: string; config: Config }> {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'parity-server-'))
  const authPath = path.join(tempDir, 'auth.json')

  await writeFile(authPath, JSON.stringify(spec.authConfig))
  await mkdir(path.join(tempDir, 'schema'), { recursive: true })
  await writeFile(path.join(tempDir, '.healthcheck'), '')

  for (const [key, value] of Object.entries(spec.files)) {
    const full = path.join(tempDir, key)
    await mkdir(path.dirname(full), { recursive: true })
    const data = typeof value === 'string' ? value : JSON.stringify(value)
    await writeFile(full, data)
  }

  return {
    tempDir,
    config: {
      port: 0,
      adminToken,
      nodeEnv: 'test',
      logLevel: 'silent',
      host: '127.0.0.1',
      storageBackend: 'local',
      storageRoot: tempDir,
      authConfigPath: authPath,
      schemaDir: path.join(tempDir, 'schema'),
      webhookConfigPath: path.join(tempDir, 'webhooks.json')
    }
  }
}

// ─── Worker seeding ──────────────────────────────────────────────────

/** Build a minimal R2 bucket backed by an in-memory Map. */
export function createMockBucket(spec: SeedSpec): R2BucketLike {
  const enc = new TextEncoder()
  const store = new Map<string, string>()

  store.set('.auth/auth.json', JSON.stringify(spec.authConfig))
  for (const [k, v] of Object.entries(spec.files)) {
    store.set(k, typeof v === 'string' ? v : JSON.stringify(v))
  }

  const toBody = (key: string, data: string): R2ObjectBodyLike => {
    const bytes = enc.encode(data)
    return {
      key,
      etag: `"${key}"`,
      size: bytes.length,
      body: new ReadableStream({
        start(c) {
          c.enqueue(bytes)
          c.close()
        }
      }),
      json: <T>() => Promise.resolve(JSON.parse(data) as T)
    }
  }

  const toHead = (key: string, data: string): R2ObjectLike => ({
    key,
    etag: `"${key}"`,
    size: enc.encode(data).length
  })

  return {
    get: async (key) => (store.has(key) ? toBody(key, store.get(key)!) : null),
    head: async (key) => (store.has(key) ? toHead(key, store.get(key)!) : null),
    list: async (options = {}) => {
      const prefix = options.prefix ?? ''
      const delimiter = options.delimiter ?? ''
      const objects: R2ObjectLike[] = []
      const prefixes = new Set<string>()

      for (const [key, data] of store) {
        if (!key.startsWith(prefix)) continue
        if (delimiter) {
          const rest = key.slice(prefix.length)
          const idx = rest.indexOf(delimiter)
          if (idx !== -1) {
            prefixes.add(prefix + rest.slice(0, idx + 1))
            continue
          }
        }
        objects.push(toHead(key, data))
      }

      return { objects, truncated: false, delimitedPrefixes: [...prefixes] }
    }
  }
}

// ─── Firing ──────────────────────────────────────────────────────────

/** Boot Fastify, fire the case, tear it down. Returns the inject response. */
export async function fireServer(c: ParityCase): Promise<InjectResponse> {
  const adminToken = c.adminToken ?? ADMIN_TOKEN
  const { tempDir, config } = await seedServer(
    c.seed ?? DEFAULT_SEED,
    adminToken
  )
  const app = await buildApp(config)
  try {
    return await app.inject({
      method: 'GET',
      url: c.path,
      headers: c.headers
    })
  } finally {
    await app.close()
    await rm(tempDir, { recursive: true, force: true })
  }
}

/** Fire the case at the Worker handler. Pass `clearAuthCache` separately. */
export function fireWorker(c: ParityCase): Promise<Response> {
  const bucket = createMockBucket(c.seed ?? DEFAULT_SEED)
  const headers = new Headers(c.headers ?? {})
  const env: Env = { BUCKET: bucket, ADMIN_TOKEN: c.adminToken ?? ADMIN_TOKEN }
  const request = new Request(`http://w${c.path}`, { method: 'GET', headers })
  // Cast: the Worker handler accepts the real R2Bucket interface; our
  // mock implements the read-only subset the routes actually call.
  return (worker.fetch as (r: Request, e: unknown) => Promise<Response>)(
    request,
    env
  )
}

// ─── Expectation resolver ────────────────────────────────────────────

/** Pull the server-side expectation out of a shared or split `expect`. */
export function serverExpect(c: ParityCase): Expectation {
  return 'server' in c.expect ? c.expect.server : c.expect
}

/** Pull the worker-side expectation out of a shared or split `expect`. */
export function workerExpect(c: ParityCase): Expectation {
  return 'worker' in c.expect ? c.expect.worker : c.expect
}
