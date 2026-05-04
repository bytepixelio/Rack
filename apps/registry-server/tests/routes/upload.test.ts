import { join } from 'path'
import { tmpdir } from 'os'
import { createHash } from 'crypto'
import { execSync } from 'child_process'
import { buildApp } from '../../src/app.js'
import type { Config } from '../../src/types.js'
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'fs/promises'
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

const TEST_ADMIN_TOKEN = 'test-admin-token'

function createConfig(storageRoot: string, authConfigPath?: string): Config {
  return {
    port: 0,
    storageRoot,
    nodeEnv: 'test',
    host: '127.0.0.1',
    logLevel: 'silent',
    storageBackend: 'local',
    adminToken: TEST_ADMIN_TOKEN,
    schemaDir: join(storageRoot, 'schema'),
    webhookConfigPath: join(storageRoot, 'webhooks.json'),
    authConfigPath: authConfigPath ?? join(storageRoot, 'auth.json')
  }
}

async function createTestPackage(
  dir: string,
  registryJson: Record<string, unknown>
): Promise<{ tarPath: string; checksum: string }> {
  const pkgDir = join(dir, `pkg-${Date.now()}`)
  await mkdir(pkgDir, { recursive: true })
  await writeFile(join(pkgDir, 'registry.json'), JSON.stringify(registryJson))

  const tarPath = join(dir, `package-${Date.now()}.tar.gz`)
  execSync(`tar -czf ${tarPath} -C ${pkgDir} .`)

  const content = await readFile(tarPath)
  const checksum = createHash('sha256').update(content).digest('hex')

  return { tarPath, checksum }
}

function buildMultipart(
  fields: Record<string, string>,
  file?: {
    name: string
    filename: string
    content: Buffer
    contentType: string
  }
): { body: Buffer; boundary: string } {
  const boundary = `----boundary-${Date.now()}`
  const parts: Buffer[] = []

  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${name}"\r\n\r\n` +
          `${value}\r\n`
      )
    )
  }

  if (file) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\n` +
          `Content-Type: ${file.contentType}\r\n\r\n`
      )
    )
    parts.push(file.content)
    parts.push(Buffer.from('\r\n'))
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`))

  return { body: Buffer.concat(parts), boundary }
}

describe('POST /registries', () => {
  let tempDir: string

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'upload-route-test-'))
    await writeFile(join(tempDir, '.healthcheck'), '')
    await writeFile(join(tempDir, 'auth.json'), JSON.stringify({ '@rack': [] }))
    await mkdir(join(tempDir, 'schema'), { recursive: true })
    await writeFile(
      join(tempDir, 'schema', 'registry-item.json'),
      JSON.stringify({
        type: 'object',
        required: ['name', 'version'],
        properties: {
          name: { type: 'string' },
          version: { type: 'string' }
        }
      })
    )

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })
  })

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('should return 401 when no auth token for protected namespace', async () => {
    const authPath = join(tempDir, 'auth-protected-401.json')
    await writeFile(
      authPath,
      JSON.stringify({ '@rack': [{ token: 'secret', publish: true }] })
    )

    const app = await buildApp(createConfig(tempDir, authPath))
    const { tarPath, checksum } = await createTestPackage(tempDir, {
      name: 'notoken',
      version: '1.0.0',
      namespace: '@rack'
    })
    const tarContent = await readFile(tarPath)

    const { body, boundary } = buildMultipart(
      { checksum },
      {
        name: 'package',
        filename: 'pkg.tar.gz',
        content: tarContent,
        contentType: 'application/gzip'
      }
    )

    const res = await app.inject({
      method: 'POST',
      url: '/registries',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body
    })

    expect(res.statusCode).toBe(401)
    expect(res.json().code).toBe('UNAUTHORIZED')
    await app.close()
  })

  it('should return 400 for invalid file type', async () => {
    const app = await buildApp(createConfig(tempDir))
    const { body, boundary } = buildMultipart(
      { checksum: 'abc' },
      {
        name: 'package',
        filename: 'file.txt',
        content: Buffer.from('hello'),
        contentType: 'text/plain'
      }
    )

    const res = await app.inject({
      method: 'POST',
      url: '/registries',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': `multipart/form-data; boundary=${boundary}`
      },
      payload: body
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('INVALID_FILE_TYPE')
    await app.close()
  })

  it('should return 400 when checksum is missing', async () => {
    const app = await buildApp(createConfig(tempDir))
    const { tarPath } = await createTestPackage(tempDir, {
      name: 'x',
      version: '1.0.0',
      namespace: '@rack'
    })
    const tarContent = await readFile(tarPath)

    const { body, boundary } = buildMultipart(
      {},
      {
        name: 'package',
        filename: 'pkg.tar.gz',
        content: tarContent,
        contentType: 'application/gzip'
      }
    )

    const res = await app.inject({
      method: 'POST',
      url: '/registries',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': `multipart/form-data; boundary=${boundary}`
      },
      payload: body
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('MISSING_CHECKSUM')
    await app.close()
  })

  it('should return 400 when checksum does not match', async () => {
    const app = await buildApp(createConfig(tempDir))
    const { tarPath } = await createTestPackage(tempDir, {
      name: 'x',
      version: '1.0.0',
      namespace: '@rack'
    })
    const tarContent = await readFile(tarPath)

    const { body, boundary } = buildMultipart(
      { checksum: 'wrong-hash' },
      {
        name: 'package',
        filename: 'pkg.tar.gz',
        content: tarContent,
        contentType: 'application/gzip'
      }
    )

    const res = await app.inject({
      method: 'POST',
      url: '/registries',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': `multipart/form-data; boundary=${boundary}`
      },
      payload: body
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('CHECKSUM_MISMATCH')
    await app.close()
  })

  it('should return 403 for disallowed namespace', async () => {
    const app = await buildApp(createConfig(tempDir))
    const { tarPath, checksum } = await createTestPackage(tempDir, {
      name: 'pkg',
      version: '1.0.0',
      namespace: '@evil'
    })
    const tarContent = await readFile(tarPath)

    const { body, boundary } = buildMultipart(
      { checksum },
      {
        name: 'package',
        filename: 'pkg.tar.gz',
        content: tarContent,
        contentType: 'application/gzip'
      }
    )

    const res = await app.inject({
      method: 'POST',
      url: '/registries',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': `multipart/form-data; boundary=${boundary}`
      },
      payload: body
    })

    expect(res.statusCode).toBe(403)
    expect(res.json().code).toBe('NAMESPACE_NOT_ALLOWED')
    await app.close()
  })

  it('should return 403 when token lacks publish permission', async () => {
    const authPath = join(tempDir, 'auth-no-publish.json')
    await writeFile(
      authPath,
      JSON.stringify({
        '@rack': [{ token: 'read-only', publish: false }]
      })
    )

    const app = await buildApp(createConfig(tempDir, authPath))
    const { tarPath, checksum } = await createTestPackage(tempDir, {
      name: 'nopub',
      version: '1.0.0',
      namespace: '@rack'
    })
    const tarContent = await readFile(tarPath)

    const { body, boundary } = buildMultipart(
      { checksum },
      {
        name: 'package',
        filename: 'pkg.tar.gz',
        content: tarContent,
        contentType: 'application/gzip'
      }
    )

    const res = await app.inject({
      method: 'POST',
      url: '/registries',
      headers: {
        authorization: 'Bearer read-only',
        'content-type': `multipart/form-data; boundary=${boundary}`
      },
      payload: body
    })

    expect(res.statusCode).toBe(403)
    expect(res.json().code).toBe('INSUFFICIENT_PERMISSIONS')
    await app.close()
  })

  it('should return 400 when multipart has no file field', async () => {
    const app = await buildApp(createConfig(tempDir))
    const { body, boundary } = buildMultipart({ checksum: 'abc' })

    const res = await app.inject({
      method: 'POST',
      url: '/registries',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': `multipart/form-data; boundary=${boundary}`
      },
      payload: body
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('MISSING_FILE')
    await app.close()
  })

  it('should return 401 when upload token is invalid for protected namespace', async () => {
    const authPath = join(tempDir, 'auth-protected.json')
    await writeFile(
      authPath,
      JSON.stringify({
        '@rack': [{ token: 'correct-token', publish: true }]
      })
    )

    const app = await buildApp(createConfig(tempDir, authPath))
    const { tarPath, checksum } = await createTestPackage(tempDir, {
      name: 'denied',
      version: '1.0.0',
      namespace: '@rack'
    })
    const tarContent = await readFile(tarPath)

    const { body, boundary } = buildMultipart(
      { checksum },
      {
        name: 'package',
        filename: 'pkg.tar.gz',
        content: tarContent,
        contentType: 'application/gzip'
      }
    )

    const res = await app.inject({
      method: 'POST',
      url: '/registries',
      headers: {
        authorization: 'Bearer wrong-token',
        'content-type': `multipart/form-data; boundary=${boundary}`
      },
      payload: body
    })

    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('should upload successfully and return 201', async () => {
    const app = await buildApp(createConfig(tempDir))
    const { tarPath, checksum } = await createTestPackage(tempDir, {
      name: 'upload-ok',
      version: '1.0.0',
      namespace: '@rack'
    })
    const tarContent = await readFile(tarPath)

    const { body, boundary } = buildMultipart(
      { checksum },
      {
        name: 'package',
        filename: 'pkg.tar.gz',
        content: tarContent,
        contentType: 'application/gzip'
      }
    )

    const res = await app.inject({
      method: 'POST',
      url: '/registries',
      headers: {
        authorization: `Bearer ${TEST_ADMIN_TOKEN}`,
        'content-type': `multipart/form-data; boundary=${boundary}`
      },
      payload: body
    })

    expect(res.statusCode).toBe(201)
    const resBody = res.json()
    expect(resBody.namespace).toBe('@rack')
    expect(resBody.name).toBe('upload-ok')
    expect(resBody.version).toBe('1.0.0')
    await app.close()
  })

  it('should return 409 when version already exists', async () => {
    const app = await buildApp(createConfig(tempDir))
    const { tarPath, checksum } = await createTestPackage(tempDir, {
      name: 'upload-ok',
      version: '1.0.0',
      namespace: '@rack'
    })
    const tarContent = await readFile(tarPath)

    const { body, boundary } = buildMultipart(
      { checksum },
      {
        name: 'package',
        filename: 'pkg.tar.gz',
        content: tarContent,
        contentType: 'application/gzip'
      }
    )

    const res = await app.inject({
      method: 'POST',
      url: '/registries',
      headers: {
        authorization: `Bearer ${TEST_ADMIN_TOKEN}`,
        'content-type': `multipart/form-data; boundary=${boundary}`
      },
      payload: body
    })

    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('VERSION_EXISTS')
    await app.close()
  })

  it('should return 403 when uploading to anonymous namespace without admin token', async () => {
    const app = await buildApp(createConfig(tempDir))
    const { tarPath, checksum } = await createTestPackage(tempDir, {
      name: 'anon-upload',
      version: '1.0.0',
      namespace: '@rack'
    })
    const tarContent = await readFile(tarPath)

    const { body, boundary } = buildMultipart(
      { checksum },
      {
        name: 'package',
        filename: 'pkg.tar.gz',
        content: tarContent,
        contentType: 'application/gzip'
      }
    )

    const res = await app.inject({
      method: 'POST',
      url: '/registries',
      headers: {
        authorization: 'Bearer some-random-token',
        'content-type': `multipart/form-data; boundary=${boundary}`
      },
      payload: body
    })

    expect(res.statusCode).toBe(403)
    expect(res.json().code).toBe('ANONYMOUS_UPLOAD_FORBIDDEN')
    await app.close()
  })

  it('should allow admin token to upload to anonymous namespace', async () => {
    const app = await buildApp(createConfig(tempDir))
    const { tarPath, checksum } = await createTestPackage(tempDir, {
      name: 'admin-upload',
      version: '1.0.0',
      namespace: '@rack'
    })
    const tarContent = await readFile(tarPath)

    const { body, boundary } = buildMultipart(
      { checksum },
      {
        name: 'package',
        filename: 'pkg.tar.gz',
        content: tarContent,
        contentType: 'application/gzip'
      }
    )

    const res = await app.inject({
      method: 'POST',
      url: '/registries',
      headers: {
        authorization: `Bearer ${TEST_ADMIN_TOKEN}`,
        'content-type': `multipart/form-data; boundary=${boundary}`
      },
      payload: body
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().namespace).toBe('@rack')
    await app.close()
  })

  it('should reject upload when ADMIN_TOKEN is not configured', async () => {
    const config = { ...createConfig(tempDir), adminToken: undefined }
    const app = await buildApp(config)
    const { tarPath, checksum } = await createTestPackage(tempDir, {
      name: 'no-admin',
      version: '1.0.0',
      namespace: '@rack'
    })
    const tarContent = await readFile(tarPath)

    const { body, boundary } = buildMultipart(
      { checksum },
      {
        name: 'package',
        filename: 'pkg.tar.gz',
        content: tarContent,
        contentType: 'application/gzip'
      }
    )

    const res = await app.inject({
      method: 'POST',
      url: '/registries',
      headers: {
        authorization: `Bearer ${TEST_ADMIN_TOKEN}`,
        'content-type': `multipart/form-data; boundary=${boundary}`
      },
      payload: body
    })

    expect(res.statusCode).toBe(403)
    expect(res.json().code).toBe('ANONYMOUS_UPLOAD_FORBIDDEN')
    await app.close()
  })
})
