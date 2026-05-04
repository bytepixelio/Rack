import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  getCliVersion,
  getMinNodeVersion
} from '../../../src/lib/utils/version.js'
import * as fs from '../../../src/lib/infra/fs.js'

afterEach(() => vi.restoreAllMocks())

describe('utils/version', () => {
  it('getCliVersion returns the version from package.json', async () => {
    const v = await getCliVersion()
    expect(v).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('getMinNodeVersion returns the minimum satisfying Node version from engines', async () => {
    const v = await getMinNodeVersion()
    expect(v).toMatch(/^\d+\.\d+\.\d+/)
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
