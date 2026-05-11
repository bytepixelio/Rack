import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
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

import { git } from '../../src/lib/git.js'

describe('git', () => {
  let tmp: string
  beforeEach(async () => {
    tmp = await makeTmpDir('proj')
    execFileMock.mockReset()
  })
  afterEach(async () => {
    await cleanTmpDir(tmp)
    vi.restoreAllMocks()
  })

  it('isRepository returns true when a .git directory exists', async () => {
    await mkdir(join(tmp, '.git'))
    expect(await git.isRepository(tmp)).toBe(true)
  })

  it('isRepository returns false when no .git directory is present', async () => {
    expect(await git.isRepository(tmp)).toBe(false)
  })

  it('init executes `git init` in the target directory', async () => {
    await git.init(tmp)
    expect(execFileMock).toHaveBeenCalledWith('git', ['init'], { cwd: tmp })
  })

  it('init propagates errors from git subprocess', async () => {
    execFileMock.mockReturnValueOnce(new Error('git not found'))
    await expect(git.init(tmp)).rejects.toThrow('git not found')
  })
})
