import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('node:os', async () => {
  const real = await vi.importActual<typeof import('node:os')>('node:os')
  return { ...real, homedir: vi.fn(() => process.env.__TMP_HOME__ as string) }
})

import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { makeTmpDir, cleanTmpDir } from '../helpers/tmp.js'

async function loadRackrc() {
  vi.resetModules()
  return await import('../../src/lib/rackrc.js')
}

describe('rackrc', () => {
  let tmp: string
  let rcPath: string

  beforeEach(async () => {
    tmp = await makeTmpDir('home')
    process.env.__TMP_HOME__ = tmp
    rcPath = join(tmp, '.rackrc')
  })
  afterEach(async () => {
    await cleanTmpDir(tmp)
    delete process.env.__TMP_HOME__
    vi.restoreAllMocks()
  })

  it('load returns default config when the file is missing', async () => {
    const { rackrc } = await loadRackrc()
    const cfg = await rackrc.load()
    expect(cfg.registries['@rack']).toBe('https://registry.rackjs.com')
  })

  it('load merges user config with default @rack entry', async () => {
    await writeFile(
      rcPath,
      JSON.stringify({ registries: { '@acme': 'https://acme.com' } })
    )
    const { rackrc } = await loadRackrc()
    const cfg = await rackrc.load()
    expect(cfg.registries['@rack']).toBe('https://registry.rackjs.com')
    expect(cfg.registries['@acme']).toBe('https://acme.com')
  })

  it('load ignores a non-object registries field and keeps defaults', async () => {
    await writeFile(rcPath, JSON.stringify({ registries: 'oops' }))
    const { rackrc } = await loadRackrc()
    const cfg = await rackrc.load()
    expect(cfg.registries).toEqual({ '@rack': 'https://registry.rackjs.com' })
  })

  it('load throws ConfigError when the file contains invalid JSON', async () => {
    await writeFile(rcPath, '{ not json')
    const { rackrc } = await loadRackrc()
    await expect(rackrc.load()).rejects.toMatchObject({ code: 'CONFIG_ERROR' })
  })

  it('load rethrows non-SyntaxError errors unchanged', async () => {
    const { rackrc } = await loadRackrc()
    const fs = await import('../../src/lib/infra/fs.js')
    vi.spyOn(fs, 'pathExists').mockResolvedValue(true)
    vi.spyOn(fs, 'readJSON').mockRejectedValue(new Error('io'))
    await expect(rackrc.load()).rejects.toThrow('io')
  })

  it('save writes config as formatted JSON', async () => {
    const { rackrc } = await loadRackrc()
    await rackrc.save({ registries: { '@acme': 'https://x.com' } })
    const { readFile } = await import('node:fs/promises')
    const raw = await readFile(rcPath, 'utf8')
    expect(JSON.parse(raw).registries['@acme']).toBe('https://x.com')
  })

  it('getConfigPath returns the absolute path to .rackrc', async () => {
    const { rackrc } = await loadRackrc()
    expect(rackrc.getConfigPath()).toBe(rcPath)
  })

  it('resolveRegistry returns plain URL for string entries', async () => {
    const { rackrc } = await loadRackrc()
    expect(rackrc.resolveRegistry('https://a.com')).toEqual({
      url: 'https://a.com'
    })
  })

  it('resolveRegistry converts token into Authorization Bearer header', async () => {
    const { rackrc } = await loadRackrc()
    const r = rackrc.resolveRegistry({ url: 'https://a.com', token: 'T' })
    expect(r.headers).toEqual({ Authorization: 'Bearer T' })
  })

  it('resolveRegistry omits headers when empty', async () => {
    const { rackrc } = await loadRackrc()
    const r = rackrc.resolveRegistry({ url: 'https://a.com' })
    expect(r.headers).toBeUndefined()
  })

  it('resolveRegistry merges custom headers with Bearer token', async () => {
    const { rackrc } = await loadRackrc()
    const r = rackrc.resolveRegistry({
      url: 'https://a.com',
      token: 'T',
      headers: { 'X-Trace': 'a' }
    })
    expect(r.headers).toEqual({
      'X-Trace': 'a',
      Authorization: 'Bearer T'
    })
  })

  it('getRegistry returns the entry for the requested namespace', async () => {
    await writeFile(
      rcPath,
      JSON.stringify({ registries: { '@acme': 'https://acme.com' } })
    )
    const { rackrc } = await loadRackrc()
    expect(await rackrc.getRegistry('@acme')).toEqual({
      url: 'https://acme.com'
    })
  })

  it('getRegistry falls back to default namespace when not configured', async () => {
    const { rackrc } = await loadRackrc()
    expect(await rackrc.getRegistry('@unknown')).toEqual({
      url: 'https://registry.rackjs.com'
    })
  })

  it('setRegistry persists a new namespace', async () => {
    const { rackrc } = await loadRackrc()
    await rackrc.setRegistry('@acme', 'https://acme.com')
    const cfg = await rackrc.load()
    expect(cfg.registries['@acme']).toBe('https://acme.com')
  })

  it('removeRegistry returns true when the namespace exists', async () => {
    const { rackrc } = await loadRackrc()
    await rackrc.setRegistry('@acme', 'https://acme.com')
    expect(await rackrc.removeRegistry('@acme')).toBe(true)
    const cfg = await rackrc.load()
    expect(cfg.registries['@acme']).toBeUndefined()
  })

  it('removeRegistry returns false when the namespace is absent', async () => {
    const { rackrc } = await loadRackrc()
    expect(await rackrc.removeRegistry('@missing')).toBe(false)
  })

  it('listRegistries returns all registries resolved', async () => {
    await writeFile(
      rcPath,
      JSON.stringify({
        registries: { '@acme': { url: 'https://acme.com', token: 'T' } }
      })
    )
    const { rackrc } = await loadRackrc()
    const all = await rackrc.listRegistries()
    expect(all['@rack']).toEqual({ url: 'https://registry.rackjs.com' })
    expect(all['@acme']).toEqual({
      url: 'https://acme.com',
      headers: { Authorization: 'Bearer T' }
    })
  })
})
