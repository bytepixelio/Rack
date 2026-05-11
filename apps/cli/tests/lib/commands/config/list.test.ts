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
  rackrc: { listRegistries: vi.fn() }
}))

import { runCommand } from '../helpers.js'
import { rackrc } from '../../../../src/lib/rackrc.js'
import { registerListCommand } from '../../../../src/lib/commands/config/list.js'

const listMock = rackrc.listRegistries as unknown as ReturnType<typeof vi.fn>

let logSpy: MockInstance<typeof console.log>
let infoSpy: MockInstance<typeof console.info>
let exitSpy: MockInstance<typeof process.exit>

beforeEach(() => {
  listMock.mockReset()
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('__exit__')
  })
})
afterEach(() => vi.restoreAllMocks())

describe('config list', () => {
  const program = (c: import('commander').Command) =>
    registerListCommand(c.command('config'))

  it('prints all registries in human-readable form', async () => {
    listMock.mockResolvedValue({
      '@rack': { url: 'https://registry.rackjs.com' },
      '@acme': { url: 'https://a.com', headers: { A: 'b' } }
    })
    await runCommand(program, ['config', 'list'])
    const out = infoSpy.mock.calls.flat().join('\n')
    expect(out).toContain('@rack')
    expect(out).toContain('@acme')
  })

  it('prints JSON when --json flag is set', async () => {
    listMock.mockResolvedValue({ '@rack': { url: 'x' } })
    await runCommand(program, ['config', 'list', '--json'])
    expect(JSON.parse(logSpy.mock.calls[0][0] as string)).toEqual({
      '@rack': { url: 'x' }
    })
  })

  it('exits with error when listRegistries throws', async () => {
    listMock.mockRejectedValue(new Error('boom'))
    await expect(runCommand(program, ['config', 'list'])).rejects.toThrow(
      '__exit__'
    )
    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})
