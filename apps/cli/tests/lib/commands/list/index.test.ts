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
  rackrc: { getRegistry: vi.fn() }
}))
vi.mock('../../../../src/lib/infra/http.js', () => {
  const get = vi.fn()
  return { HttpClient: vi.fn(() => ({ get })), __get: get }
})

import { runCommand } from '../helpers.js'
import { rackrc } from '../../../../src/lib/rackrc.js'
import * as httpModule from '../../../../src/lib/infra/http.js'
import { registerListCommand } from '../../../../src/lib/commands/list/index.js'

const getRegistryMock = rackrc.getRegistry as unknown as ReturnType<
  typeof vi.fn
>
const httpGetMock = (
  httpModule as unknown as {
    __get: ReturnType<typeof vi.fn>
  }
).__get

let exitSpy: MockInstance<typeof process.exit>
let logSpy: MockInstance<typeof console.log>
let infoSpy: MockInstance<typeof console.info>

beforeEach(() => {
  getRegistryMock.mockReset()
  httpGetMock.mockReset()
  getRegistryMock.mockResolvedValue({ url: 'https://r.example.com' })
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('__exit__')
  })
})
afterEach(() => vi.restoreAllMocks())

describe('list command', () => {
  it('calls /namespaces when no argument is given', async () => {
    httpGetMock.mockResolvedValue({ data: { namespaces: ['@rack', '@corp'] } })
    await runCommand(registerListCommand, ['list'])
    expect(httpGetMock).toHaveBeenCalledWith(
      'https://r.example.com/namespaces',
      { headers: undefined }
    )
    const out = infoSpy.mock.calls.flat().join('\n')
    expect(out).toContain('@rack')
    expect(out).toContain('@corp')
  })

  it('calls /namespaces/:ns/registries when a namespace is given', async () => {
    httpGetMock.mockResolvedValue({
      data: { namespace: '@rack', registries: ['tailwindcss', 'runtimes/node'] }
    })
    await runCommand(registerListCommand, ['list', '@rack'])
    expect(httpGetMock).toHaveBeenCalledWith(
      'https://r.example.com/namespaces/%40rack/registries',
      { headers: undefined }
    )
    const out = infoSpy.mock.calls.flat().join('\n')
    expect(out).toContain('@rack/tailwindcss')
    expect(out).toContain('@rack/runtimes/node')
  })

  it('emits raw JSON when --json is passed with a namespace', async () => {
    httpGetMock.mockResolvedValue({
      data: { namespace: '@rack', registries: ['tailwindcss'] }
    })
    await runCommand(registerListCommand, ['list', '@rack', '--json'])
    const out = logSpy.mock.calls.flat().join('\n')
    expect(JSON.parse(out)).toEqual({
      namespace: '@rack',
      registries: ['tailwindcss']
    })
  })

  it('emits raw JSON when --json is passed without a namespace', async () => {
    httpGetMock.mockResolvedValue({
      data: { namespaces: ['@rack', '@corp'] }
    })
    await runCommand(registerListCommand, ['list', '--json'])
    const out = logSpy.mock.calls.flat().join('\n')
    expect(JSON.parse(out)).toEqual({ namespaces: ['@rack', '@corp'] })
  })

  it('forwards configured headers to the HTTP client', async () => {
    getRegistryMock.mockResolvedValue({
      url: 'https://r.example.com',
      headers: { Authorization: 'Bearer x' }
    })
    httpGetMock.mockResolvedValue({ data: { namespaces: [] } })
    await runCommand(registerListCommand, ['list'])
    expect(httpGetMock).toHaveBeenCalledWith(
      'https://r.example.com/namespaces',
      { headers: { Authorization: 'Bearer x' } }
    )
  })

  it('uses --registry to pick a non-default namespace', async () => {
    getRegistryMock.mockImplementation(async (ns: string) => ({
      url: ns === '@corp' ? 'https://corp.example.com' : 'https://r.example.com'
    }))
    httpGetMock.mockResolvedValue({ data: { namespaces: [] } })
    await runCommand(registerListCommand, ['list', '--registry', '@corp'])
    expect(getRegistryMock).toHaveBeenCalledWith('@corp')
    expect(httpGetMock).toHaveBeenCalledWith(
      'https://corp.example.com/namespaces',
      { headers: undefined }
    )
  })

  it('exits with code 1 when the HTTP request fails', async () => {
    httpGetMock.mockRejectedValue(new Error('down'))
    await expect(runCommand(registerListCommand, ['list'])).rejects.toThrow(
      '__exit__'
    )
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('shows a friendly message when an empty namespace list is returned', async () => {
    httpGetMock.mockResolvedValue({ data: { namespaces: [] } })
    await runCommand(registerListCommand, ['list'])
    const out = infoSpy.mock.calls.flat().join('\n')
    expect(out).toContain('No namespaces found')
  })

  it('shows a friendly message when a namespace has no registries', async () => {
    httpGetMock.mockResolvedValue({
      data: { namespace: '@rack', registries: [] }
    })
    await runCommand(registerListCommand, ['list', '@rack'])
    const out = infoSpy.mock.calls.flat().join('\n')
    expect(out).toContain('No registries found in namespace')
    expect(out).toContain('@rack')
  })
})
