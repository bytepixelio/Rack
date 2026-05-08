import path from 'node:path'
import { execa } from 'execa'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { mkdtemp, readFile, rm } from 'node:fs/promises'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_DIR = path.resolve(HERE, '../fixtures/upload-fixture')
const CATEGORIZED_FIXTURE_DIR = path.resolve(
  HERE,
  '../fixtures/upload-categorized-fixture'
)

export interface UploadPackage {
  path: string
  checksum: string
  cleanup: () => Promise<void>
}

export interface UploadOptions {
  serverUrl: string
  checksum: string
  packagePath: string
  authHeader?: string
}

/**
 * Build a tar.gz of the upload smoke fixture.
 *
 * Returns the archive path, its SHA-256 checksum, and a cleanup handle.
 * The fixture is a minimal `@rack/e2e-upload-smoke@0.0.0` package whose
 * sole purpose is exercising the upload surface — not installable via
 * `rk add`.
 */
export async function buildUploadPackage(): Promise<UploadPackage> {
  return buildPackage(FIXTURE_DIR)
}

/**
 * Build a tar.gz of the categorized round-trip fixture.
 *
 * Same shape as {@link buildUploadPackage} but the registry has
 * `type: registry:quality`, so install lands at
 * `@rack/quality/e2e-roundtrip-quality/0.0.0` rather than the flat
 * `@rack/<name>` path. Round-trip tests use it to observe read and
 * write paths on the same multi-segment data.
 */
export async function buildCategorizedUploadPackage(): Promise<UploadPackage> {
  return buildPackage(CATEGORIZED_FIXTURE_DIR)
}

async function buildPackage(fixtureDir: string): Promise<UploadPackage> {
  const dir = await mkdtemp(path.join(tmpdir(), 'rack-e2e-upload-'))
  const pkgPath = path.join(dir, 'pkg.tar.gz')

  await execa('tar', ['-czf', pkgPath, '-C', fixtureDir, '.'])

  const buf = await readFile(pkgPath)
  const checksum = createHash('sha256').update(buf).digest('hex')

  return {
    path: pkgPath,
    checksum,
    cleanup: () => rm(dir, { recursive: true, force: true })
  }
}

/**
 * POST `/registries` with a multipart form (package + checksum).
 *
 * Returns the HTTP status code. Does not throw on non-2xx — callers assert
 * on the returned status.
 *
 * @param opts - Upload parameters (server URL, package, checksum, optional auth)
 */
export async function uploadPackage(opts: UploadOptions): Promise<number> {
  const buf = await readFile(opts.packagePath)
  const form = new FormData()
  form.append('package', new Blob([buf]), 'pkg.tar.gz')
  form.append('checksum', opts.checksum)

  const headers: Record<string, string> = {}
  if (opts.authHeader) headers['Authorization'] = opts.authHeader

  const res = await fetch(`${opts.serverUrl}/registries`, {
    method: 'POST',
    body: form,
    headers
  })

  return res.status
}
