import { join } from 'path'
import { tmpdir } from 'os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { StorageService } from '../../src/services/storage.service.js'
import { chmod, mkdtemp, mkdir, symlink, writeFile, rm } from 'fs/promises'

describe('StorageService', () => {
  let tempDir: string
  let storage: StorageService

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'storage-test-'))
    storage = new StorageService(tempDir)
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  // ─── checkHealth ─────────────────────────────────────────────────────────

  it('should return accessible true when healthcheck file exists', async () => {
    await writeFile(join(tempDir, '.healthcheck'), '')
    const result = await storage.checkHealth()
    expect(result.accessible).toBe(true)
  })

  it('should return accessible false when healthcheck file is missing', async () => {
    const result = await storage.checkHealth()
    expect(result.accessible).toBe(false)
    expect(result.error).toBeDefined()
  })

  // ─── findNamespaces ──────────────────────────────────────────────────────

  it('should find namespace directories', async () => {
    await mkdir(join(tempDir, '@rack'))
    await mkdir(join(tempDir, '@company'))
    await mkdir(join(tempDir, 'presets'))

    const namespaces = await storage.findNamespaces()
    expect(namespaces).toEqual(['@company', '@rack'])
  })

  it('should return empty array for empty directory', async () => {
    const namespaces = await storage.findNamespaces()
    expect(namespaces).toEqual([])
  })

  it('should return sorted namespaces', async () => {
    await mkdir(join(tempDir, '@zoo'))
    await mkdir(join(tempDir, '@alpha'))

    const namespaces = await storage.findNamespaces()
    expect(namespaces).toEqual(['@alpha', '@zoo'])
  })

  // ─── findRegistries ──────────────────────────────────────────────────────

  // The new contract: a directory is a registry iff it contains a
  // `versions.json`. Mirrors the worker's `*/versions.json` prefix scan
  // so multi-segment registries (e.g. `@rack/quality/husky`) are
  // discoverable — the old depth-1 algorithm couldn't see them.

  it('should find single-segment registries via versions.json', async () => {
    await mkdir(join(tempDir, '@rack', 'node', '1.0.0'), { recursive: true })
    await writeFile(
      join(tempDir, '@rack', 'node', 'versions.json'),
      '{"versions":["1.0.0"]}'
    )
    await mkdir(join(tempDir, '@rack', 'vue', '2.0.0'), { recursive: true })
    await writeFile(
      join(tempDir, '@rack', 'vue', 'versions.json'),
      '{"versions":["2.0.0"]}'
    )
    await mkdir(join(tempDir, '@rack', 'empty'), { recursive: true })

    const registries = await storage.findRegistries('@rack')
    expect(registries).toEqual(['node', 'vue'])
  })

  it('should find multi-segment registries (regression for #40 follow-up)', async () => {
    await mkdir(join(tempDir, '@rack', 'quality', 'husky', '1.0.0'), {
      recursive: true
    })
    await writeFile(
      join(tempDir, '@rack', 'quality', 'husky', 'versions.json'),
      '{"versions":["1.0.0"]}'
    )
    await mkdir(join(tempDir, '@rack', 'runtimes', 'node', '1.0.0'), {
      recursive: true
    })
    await writeFile(
      join(tempDir, '@rack', 'runtimes', 'node', 'versions.json'),
      '{"versions":["1.0.0"]}'
    )

    const registries = await storage.findRegistries('@rack')
    expect(registries).toEqual(['quality/husky', 'runtimes/node'])
  })

  it('should mix single- and multi-segment registries', async () => {
    await mkdir(join(tempDir, '@rack', 'node'), { recursive: true })
    await writeFile(
      join(tempDir, '@rack', 'node', 'versions.json'),
      '{"versions":["1.0.0"]}'
    )
    await mkdir(join(tempDir, '@rack', 'quality', 'husky'), { recursive: true })
    await writeFile(
      join(tempDir, '@rack', 'quality', 'husky', 'versions.json'),
      '{"versions":["1.0.0"]}'
    )

    const registries = await storage.findRegistries('@rack')
    expect(registries).toEqual(['node', 'quality/husky'])
  })

  it('should exclude directories without versions.json', async () => {
    await mkdir(join(tempDir, '@rack', 'docs', 'latest'), { recursive: true })

    const registries = await storage.findRegistries('@rack')
    expect(registries).toEqual([])
  })

  it('should throw when namespace does not exist', async () => {
    await expect(storage.findRegistries('@nonexistent')).rejects.toThrow()
  })

  it('should swallow per-entry readdir failures and return what it could see', async () => {
    await mkdir(join(tempDir, '@rack', 'good'), { recursive: true })
    await writeFile(
      join(tempDir, '@rack', 'good', 'versions.json'),
      '{"versions":["1.0.0"]}'
    )
    const blocked = join(tempDir, '@rack', 'unreadable')
    await mkdir(blocked, { recursive: true })
    await chmod(blocked, 0o000)
    try {
      const registries = await storage.findRegistries('@rack')
      expect(registries).toEqual(['good'])
    } finally {
      await chmod(blocked, 0o755)
    }
  })

  // ─── findVersions ───────────────────────────────────────────────────────

  it('should find semver version directories', async () => {
    const registryDir = join(tempDir, '@rack', 'node')
    await mkdir(join(registryDir, '1.0.0'), { recursive: true })
    await mkdir(join(registryDir, '2.1.0'), { recursive: true })
    await mkdir(join(registryDir, 'latest'), { recursive: true })
    await writeFile(join(registryDir, 'readme.md'), '')

    const versions = await storage.findVersions(registryDir)
    expect(versions).toContain('1.0.0')
    expect(versions).toContain('2.1.0')
    expect(versions).not.toContain('latest')
    expect(versions).not.toContain('readme.md')
  })

  // ─── sortVersionsDescending ──────────────────────────────────────────────

  it('should sort versions descending', () => {
    const sorted = storage.sortVersionsDescending([
      '1.0.0',
      '2.1.0',
      '0.9.0',
      '2.0.0'
    ])
    expect(sorted).toEqual(['2.1.0', '2.0.0', '1.0.0', '0.9.0'])
  })

  it('should handle empty array', () => {
    expect(storage.sortVersionsDescending([])).toEqual([])
  })

  it('should handle single version', () => {
    expect(storage.sortVersionsDescending(['1.0.0'])).toEqual(['1.0.0'])
  })

  it('should handle equal versions', () => {
    const sorted = storage.sortVersionsDescending(['1.0.0', '1.0.0'])
    expect(sorted).toEqual(['1.0.0', '1.0.0'])
  })

  it('should sort prerelease below its stable version', () => {
    const sorted = storage.sortVersionsDescending([
      '1.0.0-beta',
      '1.0.0',
      '0.9.0'
    ])
    expect(sorted).toEqual(['1.0.0', '1.0.0-beta', '0.9.0'])
  })

  it('should sort multiple prerelease identifiers correctly', () => {
    const sorted = storage.sortVersionsDescending([
      '1.0.0-beta.1',
      '1.0.0-rc.1',
      '1.0.0',
      '1.0.0-alpha'
    ])
    expect(sorted).toEqual([
      '1.0.0',
      '1.0.0-rc.1',
      '1.0.0-beta.1',
      '1.0.0-alpha'
    ])
  })

  it('should ignore build metadata for ordering', () => {
    const sorted = storage.sortVersionsDescending([
      '1.0.0+build.1',
      '1.0.0+build.2'
    ])
    expect(sorted[0]).toMatch(/^1\.0\.0\+build\.\d$/)
    expect(sorted[1]).toMatch(/^1\.0\.0\+build\.\d$/)
  })

  it('should not mutate original array', () => {
    const original = ['1.0.0', '2.0.0']
    storage.sortVersionsDescending(original)
    expect(original).toEqual(['1.0.0', '2.0.0'])
  })

  // ─── file operations ─────────────────────────────────────────────────────

  it('should detect existing and non-existing paths', async () => {
    await writeFile(join(tempDir, 'file.txt'), 'hello')
    expect(await storage.exists(join(tempDir, 'file.txt'))).toBe(true)
    expect(await storage.exists(join(tempDir, 'nope.txt'))).toBe(false)
  })

  it('should identify regular files via isFile()', async () => {
    await writeFile(join(tempDir, 'real.txt'), 'data')
    await mkdir(join(tempDir, 'subdir'))
    await symlink(join(tempDir, 'real.txt'), join(tempDir, 'link.txt'))

    expect(await storage.isFile(join(tempDir, 'real.txt'))).toBe(true)
    expect(await storage.isFile(join(tempDir, 'subdir'))).toBe(false)
    expect(await storage.isFile(join(tempDir, 'link.txt'))).toBe(false)
    expect(await storage.isFile(join(tempDir, 'missing.txt'))).toBe(false)
  })

  it('should read and write files', async () => {
    const filePath = join(tempDir, 'test.txt')
    await storage.writeFile(filePath, 'hello world')

    const content = await storage.readFile(filePath)
    expect(content).toBe('hello world')
  })

  it('should create directories recursively', async () => {
    const deepDir = join(tempDir, 'a', 'b', 'c')
    await storage.mkdirp(deepDir)
    expect(await storage.exists(deepDir)).toBe(true)
  })

  it('should rename files', async () => {
    const src = join(tempDir, 'src.txt')
    const dest = join(tempDir, 'dest.txt')
    await writeFile(src, 'data')

    await storage.rename(src, dest)
    expect(await storage.exists(src)).toBe(false)
    expect(await storage.exists(dest)).toBe(true)
  })

  it('should remove files', async () => {
    const filePath = join(tempDir, 'remove-me.txt')
    await writeFile(filePath, '')

    await storage.remove(filePath)
    expect(await storage.exists(filePath)).toBe(false)
  })
})
