/**
 * Round-trip integration test — POST → canonical-URL GET → listing.
 *
 * The asymmetry that ate three PRs (#40 / #41 / phase-2 findRegistries)
 * was always the same shape: write path and read path used different
 * abstractions of "where this registry lives", and no single test
 * observed both at once. This file is the antidote: it uploads a
 * `registry:quality`-typed fixture and immediately verifies that
 * every read endpoint sees it at the canonical multi-segment URL.
 *
 * Local-only by design — the smoke fixture in `uploads.test.ts`
 * already covers the remote path; this one focuses on the round-trip
 * invariant the local server has to honor too.
 */

import path from 'node:path'
import { tmpdir } from 'node:os'
import { rm, mkdtemp } from 'node:fs/promises'
import { startServer } from '../src/server.js'
import { buildCategorizedUploadPackage } from '../src/upload.js'
import { it, expect, describe, afterAll, beforeAll } from 'vitest'

import type { TestServer } from '../src/server.js'
import type { UploadPackage } from '../src/upload.js'

const ADMIN_TOKEN = 'e2e-test-admin-token'
const NAMESPACE = '@rack'
const NAME = 'e2e-roundtrip-quality'
const VERSION = '0.0.0'
const CANONICAL_PATH = `${NAMESPACE}/quality/${NAME}`
const FLAT_PATH = `${NAMESPACE}/${NAME}`

// Remote mode: a real registry-server might already host other
// modules, and we'd need cleanup we can't safely automate here.
const isRemote = Boolean(process.env.RACK_REGISTRY_URL)

describe.skipIf(isRemote)(
  'round-trip: upload a categorized registry, then read it back',
  () => {
    let server: TestServer
    let pkg: UploadPackage
    let storageDir: string

    beforeAll(async () => {
      storageDir = await mkdtemp(path.join(tmpdir(), 'rack-e2e-roundtrip-'))
      server = await startServer({
        adminToken: ADMIN_TOKEN,
        storageRoot: storageDir
      })
      pkg = await buildCategorizedUploadPackage()
    })

    afterAll(async () => {
      await pkg.cleanup()
      await server.close()
      await rm(storageDir, { force: true, recursive: true })
    })

    it('POST /registries → 201 with canonical multi-segment path', async () => {
      const res = await fetch(`${server.url}/registries`, {
        method: 'POST',
        body: await buildForm(pkg),
        headers: { Authorization: `Bearer ${server.adminToken!}` }
      })

      expect(res.status).toBe(201)
      const body = (await res.json()) as { path: string; namespace: string }
      expect(body.namespace).toBe(NAMESPACE)
      // The 201's `path` reports the actual storage location — must include
      // the `quality/` segment derived from `type: registry:quality`.
      expect(body.path).toBe(`${CANONICAL_PATH}/${VERSION}`)
    })

    it('GET versioned registry.json at canonical URL → 200', async () => {
      const res = await fetch(
        `${server.url}/registries/${CANONICAL_PATH}/${VERSION}`
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as { name: string; namespace: string }
      expect(body.name).toBe(NAME)
      expect(body.namespace).toBe(NAMESPACE)
    })

    it('GET versions.json at canonical URL → contains uploaded version', async () => {
      const res = await fetch(
        `${server.url}/registries/${CANONICAL_PATH}/versions`
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as { versions: string[] }
      expect(body.versions).toContain(VERSION)
    })

    it('GET latest at canonical URL → 200 with same payload', async () => {
      const res = await fetch(`${server.url}/registries/${CANONICAL_PATH}`)
      expect(res.status).toBe(200)
      const body = (await res.json()) as { name: string; version: string }
      expect(body.name).toBe(NAME)
      expect(body.version).toBe(VERSION)
    })

    it('GET namespace listing → contains canonical relative path', async () => {
      const res = await fetch(
        `${server.url}/namespaces/${NAMESPACE}/registries`
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as { registries: string[] }
      expect(body.registries).toContain(`quality/${NAME}`)
    })

    it('GET wrong (flat) URL → 404, NOT 200', async () => {
      // The bug we are guarding against: data ends up at the flat path
      // and a `/@rack/<name>` URL accidentally serves it. Must 404.
      const res = await fetch(`${server.url}/registries/${FLAT_PATH}`)
      expect(res.status).toBe(404)
    })
  }
)

/** Build a multipart form body for `POST /registries` from a package. */
async function buildForm(pkg: UploadPackage): Promise<FormData> {
  const { readFile } = await import('node:fs/promises')
  const buf = await readFile(pkg.path)
  const form = new FormData()
  form.append('package', new Blob([buf]), 'pkg.tar.gz')
  form.append('checksum', pkg.checksum)
  return form
}
