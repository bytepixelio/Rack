import { join } from 'path'
import { tmpdir } from 'os'
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { StorageService } from '../../src/services/storage.service.js'

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

  it('should find registries with semver subdirectories', async () => {
    await mkdir(join(tempDir, '@rack', 'node', '1.0.0'), { recursive: true })
    await mkdir(join(tempDir, '@rack', 'vue', '2.0.0'), { recursive: true })
    await mkdir(join(tempDir, '@rack', 'empty'), { recursive: true })

    const registries = await storage.findRegistries('@rack')
    expect(registries).toEqual(['node', 'vue'])
  })

  it('should exclude directories without semver subdirectories', async () => {
    await mkdir(join(tempDir, '@rack', 'docs', 'latest'), { recursive: true })

    const registries = await storage.findRegistries('@rack')
    expect(registries).toEqual([])
  })

  it('should throw when namespace does not exist', async () => {
    await expect(storage.findRegistries('@nonexistent')).rejects.toThrow()
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

  it('should handle versions with different segment counts', () => {
    const sorted = storage.sortVersionsDescending(['1.0', '1.0.1'])
    expect(sorted).toEqual(['1.0.1', '1.0'])
  })

  it('should handle versions where b has fewer segments than a', () => {
    const sorted = storage.sortVersionsDescending(['1.0.1', '1.0'])
    expect(sorted).toEqual(['1.0.1', '1.0'])
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
