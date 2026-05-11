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
  rackrc: {
    load: vi.fn(),
    resolveRegistry: vi.fn()
  }
}))

import { runCommand } from '../helpers.js'
import { rackrc } from '../../../../src/lib/rackrc.js'
import { registerGetCommand } from '../../../../src/lib/commands/config/get.js'

const loadMock = rackrc.load as unknown as ReturnType<typeof vi.fn>
const resolveMock = rackrc.resolveRegistry as unknown as ReturnType<
  typeof vi.fn
>

let exitSpy: MockInstance<typeof process.exit>
let logSpy: MockInstance<typeof console.log>
let infoSpy: MockInstance<typeof console.info>

beforeEach(() => {
  loadMock.mockReset()
  resolveMock.mockReset()
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('__exit__')
  })
})
afterEach(() => vi.restoreAllMocks())

describe('config get', () => {
  const program = (c: import('commander').Command) =>
    registerGetCommand(c.command('config'))

  it('prints the resolved entry in human-readable form', async () => {
    loadMock.mockResolvedValue({ registries: { '@acme': 'https://a.com' } })
    resolveMock.mockReturnValue({ url: 'https://a.com' })
    await runCommand(program, ['config', 'get', '@acme'])
    const out = infoSpy.mock.calls.flat().join(' ')
    expect(out).toContain('https://a.com')
  })

  it('prints JSON when --json flag is set', async () => {
    loadMock.mockResolvedValue({ registries: { '@acme': 'https://a.com' } })
    resolveMock.mockReturnValue({ url: 'https://a.com' })
    await runCommand(program, ['config', 'get', '@acme', '--json'])
    const out = logSpy.mock.calls[0][0] as string
    expect(JSON.parse(out)).toEqual({
      namespace: '@acme',
      url: 'https://a.com'
    })
  })

  it('exits with error on invalid namespace', async () => {
    await expect(runCommand(program, ['config', 'get', 'bad'])).rejects.toThrow(
      '__exit__'
    )
    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})
