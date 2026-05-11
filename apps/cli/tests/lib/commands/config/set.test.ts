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
    setRegistry: vi.fn(),
    resolveRegistry: vi.fn((entry) =>
      typeof entry === 'string'
        ? { url: entry }
        : { url: entry.url, headers: entry.headers }
    )
  }
}))

import { runCommand } from '../helpers.js'
import { rackrc } from '../../../../src/lib/rackrc.js'
import { registerSetCommand } from '../../../../src/lib/commands/config/set.js'

const loadMock = rackrc.load as unknown as ReturnType<typeof vi.fn>
const setMock = rackrc.setRegistry as unknown as ReturnType<typeof vi.fn>

let exitSpy: MockInstance<typeof process.exit>

beforeEach(() => {
  loadMock.mockReset()
  setMock.mockReset()
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('__exit__')
  })
})
afterEach(() => vi.restoreAllMocks())

describe('config set', () => {
  const program = (c: import('commander').Command) =>
    registerSetCommand(c.command('config'))

  it('creates a new namespace with --url', async () => {
    loadMock.mockResolvedValue({ registries: {} })
    await runCommand(program, [
      'config',
      'set',
      '@acme',
      '--url',
      'https://a.com'
    ])
    expect(setMock).toHaveBeenCalledWith(
      '@acme',
      expect.objectContaining({ url: 'https://a.com' })
    )
  })

  it('merges --token into existing entry', async () => {
    loadMock.mockResolvedValue({
      registries: { '@acme': { url: 'https://a.com', headers: {} } }
    })
    await runCommand(program, ['config', 'set', '@acme', '--token', 'T'])
    const entry = setMock.mock.calls[0][1]
    expect(entry.token).toBe('T')
    expect(entry.url).toBe('https://a.com')
  })

  it('converts a string entry into an object when adding token', async () => {
    loadMock.mockResolvedValue({ registries: { '@acme': 'https://a.com' } })
    await runCommand(program, ['config', 'set', '@acme', '--token', 'T'])
    expect(setMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({ url: 'https://a.com', token: 'T' })
    )
  })

  it('parses --header in "Key: Value" format', async () => {
    loadMock.mockResolvedValue({ registries: {} })
    await runCommand(program, [
      'config',
      'set',
      '@acme',
      '--url',
      'https://a.com',
      '--header',
      'X-Trace: abc'
    ])
    const entry = setMock.mock.calls[0][1]
    expect(entry.headers).toEqual({ 'X-Trace': 'abc' })
  })

  it('warns and skips headers without a colon separator', async () => {
    loadMock.mockResolvedValue({ registries: {} })
    await runCommand(program, [
      'config',
      'set',
      '@acme',
      '--url',
      'https://a.com',
      '--header',
      'bad-format'
    ])
    const entry = setMock.mock.calls[0][1]
    expect(entry.headers).toEqual({})
  })

  it('skips headers when key or value is empty after trimming', async () => {
    loadMock.mockResolvedValue({ registries: {} })
    await runCommand(program, [
      'config',
      'set',
      '@acme',
      '--url',
      'https://a.com',
      '--header',
      ':value',
      '--header',
      'Key:'
    ])
    const entry = setMock.mock.calls[0][1]
    expect(entry.headers).toEqual({})
  })

  it('exits with error when no --url/--token/--header provided', async () => {
    loadMock.mockResolvedValue({ registries: {} })
    await expect(
      runCommand(program, ['config', 'set', '@acme'])
    ).rejects.toThrow('__exit__')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('exits on invalid namespace', async () => {
    await expect(
      runCommand(program, ['config', 'set', 'bad', '--url', 'https://x.com'])
    ).rejects.toThrow('__exit__')
  })

  it('exits when creating a brand-new namespace without --url', async () => {
    loadMock.mockResolvedValue({ registries: {} })
    await expect(
      runCommand(program, ['config', 'set', '@acme', '--token', 'T'])
    ).rejects.toThrow('__exit__')
    expect(setMock).not.toHaveBeenCalled()
  })

  it('exits when --url is not http(s)://', async () => {
    loadMock.mockResolvedValue({ registries: {} })
    await expect(
      runCommand(program, ['config', 'set', '@acme', '--url', 'a.com'])
    ).rejects.toThrow('__exit__')
    expect(setMock).not.toHaveBeenCalled()
  })

  it('still allows --token-only updates on an existing namespace', async () => {
    loadMock.mockResolvedValue({
      registries: { '@acme': { url: 'https://a.com', headers: {} } }
    })
    await runCommand(program, ['config', 'set', '@acme', '--token', 'T'])
    expect(setMock).toHaveBeenCalled()
  })
})
