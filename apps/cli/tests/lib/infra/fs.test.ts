import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'node:path'
import * as fsp from 'node:fs/promises'
import { makeTmpDir, cleanTmpDir } from '../../helpers/tmp.js'
import {
  chmod,
  readFile,
  readJSON,
  writeFile,
  writeJSON,
  ensureDir,
  pathExists
} from '../../../src/lib/infra/fs.js'

describe('infra/fs', () => {
  let tmp: string

  beforeEach(async () => {
    tmp = await makeTmpDir()
  })
  afterEach(async () => {
    await cleanTmpDir(tmp)
    vi.restoreAllMocks()
  })

  it('pathExists returns true for an existing path', async () => {
    expect(await pathExists(tmp)).toBe(true)
  })

  it('pathExists returns false for a missing path', async () => {
    expect(await pathExists(join(tmp, 'nope'))).toBe(false)
  })

  it('ensureDir creates nested directories recursively', async () => {
    const deep = join(tmp, 'a', 'b', 'c')
    await ensureDir(deep)
    expect(await pathExists(deep)).toBe(true)
  })

  it('readFile reads UTF-8 content by default', async () => {
    const file = join(tmp, 'a.txt')
    await fsp.writeFile(file, 'hello')
    expect(await readFile(file)).toBe('hello')
  })

  it('readFile honors a non-default encoding argument', async () => {
    const file = join(tmp, 'bin.txt')
    await fsp.writeFile(file, Buffer.from('hi'))
    expect(await readFile(file, 'latin1')).toBe('hi')
  })

  it('writeFile auto-creates parent directories for string content', async () => {
    const file = join(tmp, 'deep', 'file.txt')
    await writeFile(file, 'x')
    expect(await readFile(file)).toBe('x')
  })

  it('writeFile writes Buffer contents verbatim without encoding', async () => {
    const file = join(tmp, 'buf.bin')
    await writeFile(file, Buffer.from([0x01, 0x02]))
    const read = await fsp.readFile(file)
    expect(Array.from(read)).toEqual([1, 2])
  })

  it('writeFile respects a non-default encoding for strings', async () => {
    const file = join(tmp, 'enc.txt')
    await writeFile(file, 'abc', 'ascii')
    const read = await fsp.readFile(file, 'ascii')
    expect(read).toBe('abc')
  })

  it('readJSON and writeJSON round-trip JSON data with 2-space indent by default', async () => {
    const file = join(tmp, 'config.json')
    await writeJSON(file, { a: 1 })
    const content = await fsp.readFile(file, 'utf8')
    expect(content).toContain('\n  "a": 1')
    expect(await readJSON(file)).toEqual({ a: 1 })
  })

  it('writeJSON supports a custom indent value', async () => {
    const file = join(tmp, 'i.json')
    await writeJSON(file, { a: 1 }, 4)
    const content = await fsp.readFile(file, 'utf8')
    expect(content).toContain('\n    "a": 1')
  })

  it('chmod changes file permissions when supported', async () => {
    const file = join(tmp, 'x.sh')
    await fsp.writeFile(file, '#!/bin/sh')
    await chmod(file, 0o755)
    const stat = await fsp.stat(file)
    expect(stat.mode & 0o777).toBe(0o755)
  })

  it('chmod silently ignores errors on unsupported platforms', async () => {
    await expect(chmod(join(tmp, 'missing'), 0o755)).resolves.toBeUndefined()
  })
})
