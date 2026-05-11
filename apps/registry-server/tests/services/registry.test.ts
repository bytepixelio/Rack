import { join } from 'path'
import { tmpdir } from 'os'
import { rm, mkdir, mkdtemp, writeFile } from 'fs/promises'
import { it, expect, describe, afterEach, beforeEach } from 'vitest'
import { StorageService } from '../../src/services/storage.service.js'
import { RegistryService } from '../../src/services/registry.service.js'

describe('RegistryService', () => {
  let tempDir: string
  let registry: RegistryService

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'registry-test-'))
    const storage = new StorageService(tempDir)
    registry = new RegistryService(tempDir, storage)
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  // ─── getVersionsPath ─────────────────────────────────────────────────────

  it('should return correct versions.json path', () => {
    const path = registry.getVersionsPath('@rack', ['node'])
    expect(path).toContain('@rack/node/versions.json')
  })

  // ─── getVersionedPath ────────────────────────────────────────────────────

  it('should return correct versioned registry path', () => {
    const path = registry.getVersionedPath('@rack', ['node'], '1.0.0')
    expect(path).toContain('@rack/node/1.0.0/registry.json')
  })

  // ─── getLatestPath ───────────────────────────────────────────────────────

  it('should return path for the latest version', async () => {
    await mkdir(join(tempDir, '@rack', 'node'), { recursive: true })
    await writeFile(
      join(tempDir, '@rack', 'node', 'versions.json'),
      JSON.stringify({ versions: ['2.0.0', '1.0.0'] })
    )

    const path = await registry.getLatestPath('@rack', ['node'])
    expect(path).toContain('@rack/node/2.0.0/registry.json')
  })

  it('should throw NotFoundError when versions.json is missing', async () => {
    await expect(
      registry.getLatestPath('@rack', ['nonexistent'])
    ).rejects.toThrow('No versions available')
  })

  it('should throw NotFoundError when versions array is empty', async () => {
    await mkdir(join(tempDir, '@rack', 'node'), { recursive: true })
    await writeFile(
      join(tempDir, '@rack', 'node', 'versions.json'),
      JSON.stringify({ versions: [] })
    )

    await expect(registry.getLatestPath('@rack', ['node'])).rejects.toThrow(
      'No versions available'
    )
  })

  // ─── getFilePath ─────────────────────────────────────────────────────────

  it('should return correct file path', () => {
    const path = registry.getFilePath(
      '@rack',
      ['node'],
      '1.0.0',
      'src/index.ts'
    )
    expect(path).toContain('@rack/node/1.0.0/src/index.ts')
  })
})
