import semver from 'semver'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import * as fs from '../../../src/lib/infra/fs.js'
import { it, vi, expect, describe, afterEach } from 'vitest'
import {
  getCliVersion,
  getMinNodeVersion
} from '../../../src/lib/utils/version.js'

// Resolve apps/cli/package.json from this test file. Lock the real package
// metadata down so the dev-layout PACKAGE_PATHS entry stays honest — without
// this the previous `toMatch(/^\d+\.\d+\.\d+/)` would silently pass on the
// `'0.0.0'` fallback (regression that landed once when src/ moved to src/lib).
const cliRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..')
async function readRealPackageJson(): Promise<{
  version: string
  engines: { node: string }
}> {
  return JSON.parse(await readFile(join(cliRoot, 'package.json'), 'utf8')) as {
    version: string
    engines: { node: string }
  }
}

afterEach(() => vi.restoreAllMocks())

describe('utils/version', () => {
  it('getCliVersion returns the version recorded in apps/cli/package.json', async () => {
    const pkg = await readRealPackageJson()
    expect(await getCliVersion()).toBe(pkg.version)
  })

  it('getMinNodeVersion returns semver.minVersion of engines.node from apps/cli/package.json', async () => {
    const pkg = await readRealPackageJson()
    const expected = semver.minVersion(pkg.engines.node)?.version
    expect(await getMinNodeVersion()).toBe(expected)
  })

  it('returns fallback 0.0.0 when no package.json can be located', async () => {
    vi.spyOn(fs, 'pathExists').mockResolvedValue(false)
    expect(await getCliVersion()).toBe('0.0.0')
    expect(await getMinNodeVersion()).toBe('0.0.0')
  })

  it('returns 0.0.0 when package.json is missing the version field', async () => {
    vi.spyOn(fs, 'pathExists').mockResolvedValue(true)
    vi.spyOn(fs, 'readJSON').mockResolvedValue({})
    expect(await getCliVersion()).toBe('0.0.0')
  })

  it('returns 0.0.0 when engines.node is missing or invalid', async () => {
    vi.spyOn(fs, 'pathExists').mockResolvedValue(true)
    vi.spyOn(fs, 'readJSON').mockResolvedValue({ engines: {} })
    expect(await getMinNodeVersion()).toBe('0.0.0')
  })

  it('returns 0.0.0 when engines.node is an unsatisfiable range', async () => {
    vi.spyOn(fs, 'pathExists').mockResolvedValue(true)
    vi.spyOn(fs, 'readJSON').mockResolvedValue({
      engines: { node: '<0.0.0-0' }
    })
    expect(await getMinNodeVersion()).toBe('0.0.0')
  })
})
