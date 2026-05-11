import path from 'node:path'
import { tmpdir } from 'node:os'
import { rm, mkdtemp } from 'node:fs/promises'
import { startServer } from '../src/server.js'
import { it, expect, afterAll, describe, beforeAll } from 'vitest'
import { uploadPackage, buildUploadPackage } from '../src/upload.js'

import type { TestServer } from '../src/server.js'
import type { UploadOptions, UploadPackage } from '../src/upload.js'

const ADMIN_TOKEN = 'e2e-test-admin-token'

// Remote mode: uploads touch whatever target RACK_SERVER_URL points at.
// Skip the whole suite unless the user explicitly provides upload creds —
// read-only remote runs (RACK_REGISTRY_URL only) still go through.
const isRemote = Boolean(process.env.RACK_REGISTRY_URL)
const hasRemoteCreds =
  Boolean(process.env.RACK_SERVER_URL) && Boolean(process.env.RACK_ADMIN_TOKEN)
const skipSuite = isRemote && !hasRemoteCreds

describe.skipIf(skipSuite)('POST /registries upload surface', () => {
  let server: TestServer
  let pkg: UploadPackage
  let storageDir: string | undefined

  beforeAll(async () => {
    const options: {
      adminToken: string
      storageRoot?: string
    } = { adminToken: ADMIN_TOKEN }

    if (!isRemote) {
      storageDir = await mkdtemp(path.join(tmpdir(), 'rack-e2e-storage-'))
      options.storageRoot = storageDir
    }

    server = await startServer(options)
    pkg = await buildUploadPackage()
  })

  afterAll(async () => {
    await pkg.cleanup()
    await server.close()
    if (storageDir) await rm(storageDir, { recursive: true, force: true })
  })

  const upload = (authHeader?: string): Promise<number> => {
    const opts: UploadOptions = {
      serverUrl: server.serverUrl!,
      checksum: pkg.checksum,
      packagePath: pkg.path
    }
    if (authHeader) opts.authHeader = authHeader
    return uploadPackage(opts)
  }

  // The caller guarantees a clean target: local runs use a fresh tmpdir;
  // the deploy-worker smoke job deletes @rack/features/e2e-upload-smoke/ in R2
  // before starting the server.
  it('admin token → 201', async () => {
    const status = await upload(`Bearer ${server.adminToken!}`)
    expect(status).toBe(201)
  })

  it('duplicate upload → 409', async () => {
    const status = await upload(`Bearer ${server.adminToken!}`)
    expect(status).toBe(409)
  })

  // @rack is anonymous-read; the upload path rejects non-admin uploads
  // with 403 ANONYMOUS_UPLOAD_FORBIDDEN. If @rack is later made
  // token-gated, 401 INVALID_TOKEN is also acceptable.
  it('missing auth header → 401 or 403', async () => {
    const status = await upload()
    expect([401, 403]).toContain(status)
  })

  it('wrong token → 401 or 403', async () => {
    const status = await upload('Bearer wrong-token-xxx')
    expect([401, 403]).toContain(status)
  })

  it('uploaded version shows up in /versions via the read URL', async () => {
    const res = await fetch(
      `${server.url}/registries/@rack/features/e2e-upload-smoke/versions`,
      { headers: { 'Cache-Control': 'no-cache' } }
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { versions: string[] }
    expect(body.versions).toContain('0.0.0')
  })
})
