import {
  it,
  vi,
  expect,
  describe,
  afterEach,
  beforeEach,
  type MockInstance
} from 'vitest'
import { join } from 'node:path'
import { makeTmpDir, cleanTmpDir } from '../../../helpers/tmp.js'

vi.mock('../../../../src/lib/commands/init/pipeline.js', () => ({
  initProject: vi.fn()
}))
vi.mock('../../../../src/lib/pkg.js', () => ({
  pkg: { install: vi.fn() }
}))
vi.mock('../../../../src/lib/git.js', () => ({ git: { init: vi.fn() } }))
const prompterMocks = vi.hoisted(() => ({
  text: vi.fn(),
  withSpinner: vi.fn()
}))
vi.mock('../../../../src/lib/infra/prompts.js', () => ({
  Prompter: class {
    text = prompterMocks.text
    withSpinner = prompterMocks.withSpinner
  }
}))

import { registerInitCommand } from '../../../../src/lib/commands/init/index.js'
import { initProject } from '../../../../src/lib/commands/init/pipeline.js'
import { pkg } from '../../../../src/lib/pkg.js'
import { git } from '../../../../src/lib/git.js'
import { runCommand } from '../helpers.js'

const initProjectMock = initProject as unknown as ReturnType<typeof vi.fn>
const installMock = pkg.install as unknown as ReturnType<typeof vi.fn>
const gitInitMock = git.init as unknown as ReturnType<typeof vi.fn>

let exitSpy: MockInstance<typeof process.exit>
let tmp: string
let origCwd: string

beforeEach(async () => {
  initProjectMock.mockReset()
  installMock.mockReset()
  gitInitMock.mockReset()
  prompterMocks.text.mockReset()
  prompterMocks.withSpinner.mockReset()
  prompterMocks.text.mockResolvedValue('demo')
  prompterMocks.withSpinner.mockImplementation(
    async (_l: unknown, _t: string, fn: () => unknown) => fn()
  )
  initProjectMock.mockResolvedValue({
    targetDir: '',
    appliedRegistries: ['@rack/vue'],
    items: [],
    initialRegistries: ['@rack/vue'],
    fileChanges: [],
    dependencies: {},
    devDependencies: {},
    scripts: {}
  })
  tmp = await makeTmpDir('init-cwd')
  origCwd = process.cwd()
  process.chdir(tmp)

  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('__exit__')
  })
})
afterEach(async () => {
  process.chdir(origCwd)
  await cleanTmpDir(tmp)
  vi.restoreAllMocks()
})

describe('init command', () => {
  it('runs pipeline, writes rack.json, runs install and git init', async () => {
    await runCommand(registerInitCommand, [
      'init',
      '-t',
      '@rack/vue',
      '-n',
      'demo'
    ])
    expect(initProjectMock).toHaveBeenCalled()
    expect(installMock).toHaveBeenCalled()
    expect(gitInitMock).toHaveBeenCalled()
  })

  it('persists all applied registries (including dependencies) to rack.json', async () => {
    const { readFile } = await import('node:fs/promises')
    initProjectMock.mockResolvedValue({
      targetDir: '',
      appliedRegistries: ['@rack/vue', '@rack/postcss'],
      items: [],
      initialRegistries: ['@rack/vue'],
      fileChanges: [],
      dependencies: {},
      devDependencies: {},
      scripts: {}
    })
    await runCommand(registerInitCommand, [
      'init',
      '-t',
      '@rack/vue',
      '-n',
      'demo'
    ])
    const manifest = JSON.parse(
      await readFile(join(tmp, 'demo', 'rack.json'), 'utf8')
    )
    expect(manifest.items).toEqual(['@rack/vue', '@rack/postcss'])
  })

  it('skips install when --skip-install is set', async () => {
    await runCommand(registerInitCommand, [
      'init',
      '-t',
      '@rack/vue',
      '-n',
      'demo',
      '--skip-install'
    ])
    expect(installMock).not.toHaveBeenCalled()
    expect(gitInitMock).toHaveBeenCalled()
  })

  it('skips git init when --skip-git is set', async () => {
    await runCommand(registerInitCommand, [
      'init',
      '-t',
      '@rack/vue',
      '-n',
      'demo',
      '--skip-git'
    ])
    expect(gitInitMock).not.toHaveBeenCalled()
  })

  it('in CI mode skips both install and git init', async () => {
    await runCommand(registerInitCommand, [
      'init',
      '-t',
      '@rack/vue',
      '-n',
      'demo',
      '--ci'
    ])
    expect(installMock).not.toHaveBeenCalled()
    expect(gitInitMock).not.toHaveBeenCalled()
  })

  it('collects install failure as a warning', async () => {
    installMock.mockRejectedValue(new Error('ENOENT'))
    await runCommand(registerInitCommand, [
      'init',
      '-t',
      '@rack/vue',
      '-n',
      'demo'
    ])
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it('collects git init failure as a warning', async () => {
    gitInitMock.mockRejectedValue(new Error('no git'))
    await runCommand(registerInitCommand, [
      'init',
      '-t',
      '@rack/vue',
      '-n',
      'demo'
    ])
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it('exits when target directory exists without --force', async () => {
    const { mkdir } = await import('node:fs/promises')
    await mkdir(join(tmp, 'demo'))
    await expect(
      runCommand(registerInitCommand, ['init', '-t', '@rack/vue', '-n', 'demo'])
    ).rejects.toThrow('__exit__')
  })

  it('proceeds when target directory exists with --force', async () => {
    const { mkdir } = await import('node:fs/promises')
    await mkdir(join(tmp, 'demo'))
    await runCommand(registerInitCommand, [
      'init',
      '-t',
      '@rack/vue',
      '-n',
      'demo',
      '--force'
    ])
    expect(initProjectMock).toHaveBeenCalled()
  })

  it('exits when initProject throws', async () => {
    initProjectMock.mockRejectedValue(new Error('boom'))
    await expect(
      runCommand(registerInitCommand, ['init', '-t', '@rack/vue', '-n', 'demo'])
    ).rejects.toThrow('__exit__')
  })
})

describe('init command project name fallback', () => {
  it('falls back to my-project when prompt returns null', async () => {
    prompterMocks.text.mockResolvedValueOnce(null)
    await runCommand(registerInitCommand, ['init', '-t', '@rack/vue'])
    expect(initProjectMock).toHaveBeenCalled()
  })

  it('uses basename(targetDir) when projectName is empty string', async () => {
    await runCommand(registerInitCommand, ['init', '-t', '@rack/vue', '-n', ''])
    expect(initProjectMock).toHaveBeenCalled()
  })

  it('skips validateTargetDir when targetDir equals cwd', async () => {
    await runCommand(registerInitCommand, [
      'init',
      '-t',
      '@rack/vue',
      '-n',
      '.'
    ])
    expect(initProjectMock).toHaveBeenCalled()
  })
})
