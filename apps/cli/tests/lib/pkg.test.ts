import { join } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { makeTmpDir, cleanTmpDir } from '../helpers/tmp.js'
import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest'

const execFileMock = vi.fn()
vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => {
    const cb = args[args.length - 1] as (
      err: Error | null,
      res?: { stdout: string; stderr: string }
    ) => void
    const result = execFileMock(...args.slice(0, -1))
    if (result instanceof Error) cb(result)
    else cb(null, { stdout: '', stderr: '' })
  }
}))

import { pkg } from '../../src/lib/pkg.js'

describe('pkg', () => {
  let tmp: string
  beforeEach(async () => {
    tmp = await makeTmpDir('proj')
    execFileMock.mockReset()
  })
  afterEach(async () => {
    await cleanTmpDir(tmp)
    vi.restoreAllMocks()
  })

  it('update creates package.json with defaults when missing', async () => {
    await pkg.update(tmp, { dependencies: { a: '1.0.0' } })
    const data = JSON.parse(await readFile(join(tmp, 'package.json'), 'utf8'))
    expect(data.name).toBe('proj'.length > 0 ? data.name : '')
    expect(data.version).toBe('1.0.0')
    expect(data.dependencies).toEqual({ a: '1.0.0' })
  })

  it('update merges new fields into an existing package.json', async () => {
    await writeFile(
      join(tmp, 'package.json'),
      JSON.stringify({ name: 'app', version: '2.0.0', scripts: { dev: 'x' } })
    )
    await pkg.update(tmp, {
      scripts: { build: 'y' },
      dependencies: { a: '1.0.0' }
    })
    const data = JSON.parse(await readFile(join(tmp, 'package.json'), 'utf8'))
    expect(data).toMatchObject({
      name: 'app',
      version: '2.0.0',
      scripts: { dev: 'x', build: 'y' },
      dependencies: { a: '1.0.0' }
    })
  })

  it('update refuses to overwrite an unparseable package.json', async () => {
    await writeFile(join(tmp, 'package.json'), '{ corrupt')

    await expect(
      pkg.update(tmp, { scripts: { a: 'b' } })
    ).rejects.toMatchObject({
      code: 'PACKAGE_JSON_INVALID',
      filePath: join(tmp, 'package.json')
    })

    // The corrupt content must remain untouched so the user can recover it.
    const onDisk = await readFile(join(tmp, 'package.json'), 'utf8')
    expect(onDisk).toBe('{ corrupt')
  })

  it('update leaves existing fields alone when new ones are empty', async () => {
    await pkg.update(tmp, {
      dependencies: {},
      devDependencies: {},
      scripts: {}
    })
    const data = JSON.parse(await readFile(join(tmp, 'package.json'), 'utf8'))
    expect(data.dependencies).toBeUndefined()
    expect(data.devDependencies).toBeUndefined()
    expect(data.scripts).toBeUndefined()
  })

  it('install runs `npm install` in the target directory', async () => {
    await pkg.install(tmp)
    expect(execFileMock).toHaveBeenCalledWith('npm', ['install'], { cwd: tmp })
  })

  it('install propagates errors from npm subprocess', async () => {
    execFileMock.mockReturnValueOnce(new Error('ENOENT'))
    await expect(pkg.install(tmp)).rejects.toThrow('ENOENT')
  })

  it('update merges devDependencies into the output', async () => {
    await pkg.update(tmp, { devDependencies: { d: '1' } })
    const data = JSON.parse(await readFile(join(tmp, 'package.json'), 'utf8'))
    expect(data.devDependencies).toEqual({ d: '1' })
  })

  it('update promotes a stale devDependency to runtime when the new batch needs it as a dependency', async () => {
    await writeFile(
      join(tmp, 'package.json'),
      JSON.stringify({
        name: 'app',
        version: '1.0.0',
        devDependencies: { foo: '^1.0.0', other: '^1.0.0' }
      })
    )

    await pkg.update(tmp, { dependencies: { foo: '^1.2.0' } })

    const data = JSON.parse(await readFile(join(tmp, 'package.json'), 'utf8'))
    expect(data.dependencies).toEqual({ foo: '^1.2.0' })
    expect(data.devDependencies).toEqual({ other: '^1.0.0' })
  })

  it('update keeps a package in dependencies when a later batch declares it as dev (runtime wins)', async () => {
    await writeFile(
      join(tmp, 'package.json'),
      JSON.stringify({
        name: 'app',
        version: '1.0.0',
        dependencies: { foo: '^1.0.0' },
        devDependencies: { tsx: '^4.0.0' }
      })
    )

    await pkg.update(tmp, {
      devDependencies: { foo: '^1.2.0', vitest: '^1.0.0' }
    })

    const data = JSON.parse(await readFile(join(tmp, 'package.json'), 'utf8'))
    expect(data.dependencies).toEqual({ foo: '^1.2.0' })
    expect(data.devDependencies).toEqual({ tsx: '^4.0.0', vitest: '^1.0.0' })
  })
})
