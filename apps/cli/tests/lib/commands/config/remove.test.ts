import {
  it,
  vi,
  expect,
  describe,
  afterEach,
  beforeEach,
  type MockInstance
} from 'vitest'

vi.mock('../../../../src/lib/rackrc.js', () => ({
  rackrc: { load: vi.fn(), removeRegistry: vi.fn() }
}))

vi.mock('../../../../src/lib/infra/prompts.js', () => ({
  Prompter: vi.fn().mockImplementation(() => ({
    confirm: vi.fn()
  }))
}))

import { runCommand } from '../helpers.js'
import { rackrc } from '../../../../src/lib/rackrc.js'
import { Prompter } from '../../../../src/lib/infra/prompts.js'
import { registerRemoveCommand } from '../../../../src/lib/commands/config/remove.js'

const loadMock = rackrc.load as unknown as ReturnType<typeof vi.fn>
const removeMock = rackrc.removeRegistry as unknown as ReturnType<typeof vi.fn>
const PrompterCtor = Prompter as unknown as ReturnType<typeof vi.fn>

let exitSpy: MockInstance<typeof process.exit>

beforeEach(() => {
  loadMock.mockReset()
  removeMock.mockReset()
  PrompterCtor.mockClear()
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('__exit__')
  })
})
afterEach(() => vi.restoreAllMocks())

function promptReturns(value: boolean) {
  PrompterCtor.mockImplementation(() => ({
    confirm: vi.fn().mockResolvedValue(value)
  }))
}

describe('config remove', () => {
  const program = (c: import('commander').Command) =>
    registerRemoveCommand(c.command('config'))

  it('removes a namespace after confirmation', async () => {
    loadMock.mockResolvedValue({ registries: { '@acme': 'https://a.com' } })
    promptReturns(true)
    await runCommand(program, ['config', 'remove', '@acme'])
    expect(removeMock).toHaveBeenCalledWith('@acme')
  })

  it('skips confirmation with --force', async () => {
    loadMock.mockResolvedValue({ registries: { '@acme': 'https://a.com' } })
    await runCommand(program, ['config', 'remove', '@acme', '--force'])
    expect(removeMock).toHaveBeenCalledWith('@acme')
  })

  it('does nothing when the user cancels the confirmation', async () => {
    loadMock.mockResolvedValue({ registries: { '@acme': 'https://a.com' } })
    promptReturns(false)
    await runCommand(program, ['config', 'remove', '@acme'])
    expect(removeMock).not.toHaveBeenCalled()
  })

  it('refuses to remove the default @rack namespace', async () => {
    loadMock.mockResolvedValue({ registries: { '@rack': 'x' } })
    await expect(
      runCommand(program, ['config', 'remove', '@rack'])
    ).rejects.toThrow('__exit__')
    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(removeMock).not.toHaveBeenCalled()
  })

  it('exits with error when namespace does not exist', async () => {
    loadMock.mockResolvedValue({ registries: {} })
    await expect(
      runCommand(program, ['config', 'remove', '@ghost', '--force'])
    ).rejects.toThrow('__exit__')
  })

  it('exits on invalid namespace format', async () => {
    await expect(
      runCommand(program, ['config', 'remove', 'bad', '--force'])
    ).rejects.toThrow('__exit__')
  })
})
