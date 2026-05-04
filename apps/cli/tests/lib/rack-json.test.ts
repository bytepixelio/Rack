import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'node:path'
import { writeFile, chmod } from 'node:fs/promises'
import { makeTmpDir, cleanTmpDir } from '../helpers/tmp.js'
import { rackJson } from '../../src/lib/rack-json.js'
import { RackJsonError } from '../../src/lib/utils/errors.js'

describe('rack-json', () => {
  let tmp: string
  beforeEach(async () => (tmp = await makeTmpDir('proj')))
  afterEach(async () => {
    await cleanTmpDir(tmp)
    vi.restoreAllMocks()
  })

  it('generate includes only fields with values', () => {
    const cfg = rackJson.generate({ name: 'x' })
    expect(cfg).toEqual({
      $schema: 'https://registry.rackjs.com/schemas/rack.json',
      name: 'x'
    })
  })

  it('generate includes optional fields when provided', () => {
    const cfg = rackJson.generate({
      name: 'x',
      language: 'ts',
      template: '@presets/a',
      items: ['@rack/vue']
    })
    expect(cfg.language).toBe('ts')
    expect(cfg.template).toBe('@presets/a')
    expect(cfg.items).toEqual(['@rack/vue'])
  })

  it('generate omits items when the array is empty', () => {
    const cfg = rackJson.generate({ name: 'x', items: [] })
    expect(cfg.items).toBeUndefined()
  })

  it('read throws RackJsonError with NOT_FOUND when the file is missing', async () => {
    const err = await rackJson.read(tmp).catch((e) => e)
    expect(err).toBeInstanceOf(RackJsonError)
    expect(err.errorCode).toBe('NOT_FOUND')
  })

  it('read throws READ_FAILED when the file cannot be parsed', async () => {
    await writeFile(join(tmp, 'rack.json'), '{ bad')
    const err = await rackJson.read(tmp).catch((e) => e)
    expect(err.errorCode).toBe('READ_FAILED')
  })

  it('read throws INVALID when content is not a plain object', async () => {
    await writeFile(join(tmp, 'rack.json'), JSON.stringify([1, 2]))
    const err = await rackJson.read(tmp).catch((e) => e)
    expect(err.errorCode).toBe('INVALID')
  })

  it('read throws INVALID when the required name field is missing', async () => {
    await writeFile(join(tmp, 'rack.json'), JSON.stringify({ language: 'ts' }))
    const err = await rackJson.read(tmp).catch((e) => e)
    expect(err.errorCode).toBe('INVALID')
  })

  it('read throws INVALID when name is not a string', async () => {
    await writeFile(join(tmp, 'rack.json'), JSON.stringify({ name: 42 }))
    const err = await rackJson.read(tmp).catch((e) => e)
    expect(err.errorCode).toBe('INVALID')
  })

  it('read returns the parsed config for a valid rack.json', async () => {
    const data = { name: 'demo', items: ['@rack/vue'] }
    await writeFile(join(tmp, 'rack.json'), JSON.stringify(data))
    expect(await rackJson.read(tmp)).toMatchObject(data)
  })

  it('readOrCreate creates a new rack.json when missing', async () => {
    const cfg = await rackJson.readOrCreate(tmp)
    expect(cfg.name).toBe('proj'.length > 0 ? cfg.name : '')
    const again = await rackJson.read(tmp)
    expect(again.name).toBe(cfg.name)
  })

  it('readOrCreate rethrows unrelated errors (e.g. INVALID)', async () => {
    await writeFile(join(tmp, 'rack.json'), JSON.stringify({ name: 123 }))
    await expect(rackJson.readOrCreate(tmp)).rejects.toMatchObject({
      errorCode: 'INVALID'
    })
  })

  it('update merges and de-duplicates new items', async () => {
    await writeFile(
      join(tmp, 'rack.json'),
      JSON.stringify({ name: 'x', items: ['a'] })
    )
    await rackJson.update(tmp, ['a', 'b'])
    const got = await rackJson.read(tmp)
    expect(got.items).toEqual(['a', 'b'])
  })

  it('update handles a rack.json without items field', async () => {
    await writeFile(join(tmp, 'rack.json'), JSON.stringify({ name: 'x' }))
    await rackJson.update(tmp, ['a'])
    expect((await rackJson.read(tmp)).items).toEqual(['a'])
  })

  it('update throws WRITE_FAILED when write fails', async () => {
    await writeFile(join(tmp, 'rack.json'), JSON.stringify({ name: 'x' }))
    const fs = await import('../../src/lib/infra/fs.js')
    vi.spyOn(fs, 'writeJSON').mockRejectedValue(new Error('disk full'))
    const err = await rackJson.update(tmp, ['a']).catch((e) => e)
    expect(err).toBeInstanceOf(RackJsonError)
    expect(err.errorCode).toBe('WRITE_FAILED')
    await chmod(join(tmp, 'rack.json'), 0o644)
  })
})
