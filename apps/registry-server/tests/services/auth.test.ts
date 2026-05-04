import { join } from 'path'
import { tmpdir } from 'os'
import { mkdtemp, writeFile, rm, mkdir } from 'fs/promises'
import { AuthService } from '../../src/services/auth.service.js'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

// AuthService is a thin disk-loader that delegates parsing and verification
// to @rack/auth-core. Those modules already have exhaustive unit tests in
// `packages/auth-core/tests/`. Here we only assert the wiring this wrapper
// adds: file IO and error propagation.

describe('AuthService', () => {
  let tempDir: string
  let authPath: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'auth-test-'))
    authPath = join(tempDir, 'auth.json')
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('loads config and exposes auth-core helpers', async () => {
    await writeFile(
      authPath,
      JSON.stringify({
        '@rack': [{ token: 'secret', publish: true }],
        '@public': []
      })
    )
    const auth = new AuthService(authPath)
    await auth.load()

    expect(auth.isNamespaceAllowed('@rack')).toBe(true)
    expect(auth.isNamespaceAllowed('@evil')).toBe(false)
    expect(auth.isNamespaceAnonymous('@public')).toBe(true)
    expect(auth.verifyAccess('@rack', 'secret').allowed).toBe(true)
  })

  it('treats a missing file as no namespaces allowed', async () => {
    const auth = new AuthService(join(tempDir, 'nonexistent.json'))
    await auth.load()

    expect(auth.isNamespaceAllowed('@rack')).toBe(false)
  })

  it('throws on invalid JSON', async () => {
    await writeFile(authPath, 'not json')
    const auth = new AuthService(authPath)

    await expect(auth.load()).rejects.toThrow()
  })

  it('propagates parseAuthConfig errors', async () => {
    await writeFile(authPath, '"just a string"')
    const auth = new AuthService(authPath)

    await expect(auth.load()).rejects.toThrow('must be an object')
  })

  it('propagates non-ENOENT filesystem errors', async () => {
    await mkdir(join(tempDir, 'is-a-dir'))
    const auth = new AuthService(join(tempDir, 'is-a-dir'))

    await expect(auth.load()).rejects.toThrow()
  })
})
