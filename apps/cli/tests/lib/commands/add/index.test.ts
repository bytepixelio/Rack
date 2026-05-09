import {
  it,
  vi,
  expect,
  describe,
  afterEach,
  beforeEach,
  type MockInstance
} from 'vitest'

vi.mock('../../../../src/lib/rack-json.js', () => ({
  rackJson: { readOrCreate: vi.fn(), update: vi.fn() }
}))
vi.mock('../../../../src/lib/commands/add/pipeline.js', () => ({
  addRegistry: vi.fn()
}))

import { registerAddCommand } from '../../../../src/lib/commands/add/index.js'
import { rackJson } from '../../../../src/lib/rack-json.js'
import { addRegistry } from '../../../../src/lib/commands/add/pipeline.js'
import { runCommand } from '../helpers.js'

const readOrCreateMock = rackJson.readOrCreate as unknown as ReturnType<
  typeof vi.fn
>
const updateMock = rackJson.update as unknown as ReturnType<typeof vi.fn>
const addRegistryMock = addRegistry as unknown as ReturnType<typeof vi.fn>

let exitSpy: MockInstance<typeof process.exit>

beforeEach(() => {
  readOrCreateMock.mockReset()
  updateMock.mockReset()
  addRegistryMock.mockReset()
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('__exit__')
  })
})
afterEach(() => vi.restoreAllMocks())

describe('add command', () => {
  const baseResult = {
    targetDir: '/t',
    appliedRegistries: ['@rack/vue'],
    items: [],
    initialRegistries: ['@rack/vue'],
    fileChanges: [],
    dependencies: {},
    devDependencies: {},
    scripts: {}
  }

  it('runs pipeline and appends all applied registries to rack.json', async () => {
    readOrCreateMock.mockResolvedValue({ items: [], language: 'ts' })
    addRegistryMock.mockResolvedValue(baseResult)
    await runCommand(registerAddCommand, ['add', '@rack/vue'])
    expect(addRegistryMock).toHaveBeenCalled()
    expect(updateMock).toHaveBeenCalledWith(expect.any(String), ['@rack/vue'])
  })

  it('persists transitive dependencies to rack.json', async () => {
    readOrCreateMock.mockResolvedValue({ items: [], language: 'ts' })
    addRegistryMock.mockResolvedValue({
      ...baseResult,
      appliedRegistries: ['@rack/vue', '@rack/postcss', '@rack/utils']
    })
    await runCommand(registerAddCommand, ['add', '@rack/vue'])
    expect(updateMock).toHaveBeenCalledWith(expect.any(String), [
      '@rack/vue',
      '@rack/postcss',
      '@rack/utils'
    ])
  })

  it('short-circuits and does not call addRegistry when already installed', async () => {
    readOrCreateMock.mockResolvedValue({ items: ['@rack/vue'], language: 'ts' })
    await runCommand(registerAddCommand, ['add', '@rack/vue'])
    expect(addRegistryMock).not.toHaveBeenCalled()
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('detects already-installed registry even when using shorthand identifier', async () => {
    readOrCreateMock.mockResolvedValue({
      items: ['@rack/quality/husky'],
      language: 'ts'
    })
    await runCommand(registerAddCommand, ['add', 'quality/husky'])
    expect(addRegistryMock).not.toHaveBeenCalled()
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('short-circuits when canonical name matches but version differs', async () => {
    readOrCreateMock.mockResolvedValue({
      items: ['@rack/vue@1.0.0'],
      language: 'ts'
    })
    await runCommand(registerAddCommand, ['add', '@rack/vue@2.0.0'])
    expect(addRegistryMock).not.toHaveBeenCalled()
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('exits with error when addRegistry rejects', async () => {
    readOrCreateMock.mockResolvedValue({ items: [], language: 'ts' })
    addRegistryMock.mockRejectedValue(new Error('boom'))
    await expect(
      runCommand(registerAddCommand, ['add', '@rack/vue'])
    ).rejects.toThrow('__exit__')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('exits with error when rack.json cannot be read', async () => {
    readOrCreateMock.mockRejectedValue(new Error('rack.json broken'))
    await expect(
      runCommand(registerAddCommand, ['add', '@rack/vue'])
    ).rejects.toThrow('__exit__')
  })

  it('tolerates rack.json with no items field', async () => {
    readOrCreateMock.mockResolvedValue({ language: undefined })
    addRegistryMock.mockResolvedValue(baseResult)
    await runCommand(registerAddCommand, ['add', '@rack/vue'])
    expect(addRegistryMock).toHaveBeenCalled()
  })
})
