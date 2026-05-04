import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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

vi.mock('../../../../src/lib/rack-json.js', () => ({
  rackJson: { read: vi.fn() }
}))

vi.mock('../../../../src/lib/rackrc.js', () => ({
  rackrc: { listRegistries: vi.fn() }
}))

const httpMocks = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../../../../src/lib/infra/http.js', () => ({
  HttpClient: class {
    get = httpMocks.get
  }
}))

vi.mock('../../../../src/lib/utils/version.js', () => ({
  getMinNodeVersion: vi.fn()
}))

import { runChecks } from '../../../../src/lib/commands/doctor/checks.js'
import { rackJson } from '../../../../src/lib/rack-json.js'
import { rackrc } from '../../../../src/lib/rackrc.js'
import { getMinNodeVersion } from '../../../../src/lib/utils/version.js'

const readMock = rackJson.read as unknown as ReturnType<typeof vi.fn>
const listMock = rackrc.listRegistries as unknown as ReturnType<typeof vi.fn>
const getMock = httpMocks.get
const minNodeMock = getMinNodeVersion as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  readMock.mockReset()
  listMock.mockReset()
  getMock.mockReset()
  execFileMock.mockReset()
  minNodeMock.mockReset()
  minNodeMock.mockResolvedValue('22.10.0')
  listMock.mockResolvedValue({})
  getMock.mockResolvedValue({ status: 200 })
  readMock.mockResolvedValue({ name: 'demo', items: ['@rack/vue'] })
})
afterEach(() => vi.restoreAllMocks())

describe('doctor/checks', () => {
  it('returns hasErrors=false when everything passes', async () => {
    listMock.mockResolvedValue({ '@rack': { url: 'https://r.com' } })
    const summary = await runChecks()
    expect(summary.hasErrors).toBe(false)
    expect(summary.results.some((r) => r.category === 'environment')).toBe(true)
    expect(summary.results.some((r) => r.category === 'project')).toBe(true)
    expect(summary.results.some((r) => r.category === 'remote')).toBe(true)
  })

  it('flags an outdated Node version as error', async () => {
    minNodeMock.mockResolvedValue('99.0.0')
    const summary = await runChecks()
    const node = summary.results.find((r) => r.id === 'env.node-version')!
    expect(node.level).toBe('error')
  })

  it('flags a missing git binary as warning', async () => {
    execFileMock.mockReturnValue(new Error('not found'))
    const summary = await runChecks()
    const git = summary.results.find((r) => r.id === 'env.git')!
    expect(git.level).toBe('warning')
  })

  it('flags rack.json with no registries as warning', async () => {
    readMock.mockResolvedValue({ name: 'demo', items: [] })
    const summary = await runChecks()
    const reg = summary.results.find((r) => r.id === 'project.registries')!
    expect(reg.level).toBe('warning')
  })

  it('flags a missing/unreadable rack.json as error', async () => {
    readMock.mockRejectedValue(new Error('missing'))
    const summary = await runChecks()
    const proj = summary.results.find((r) => r.id === 'project.rack-json')!
    expect(proj.level).toBe('error')
  })

  it('uses fallback message when read throws a non-Error value', async () => {
    readMock.mockRejectedValue('plain string')
    const summary = await runChecks()
    const proj = summary.results.find((r) => r.id === 'project.rack-json')!
    expect(proj.message).toBe('Failed to read rack.json')
  })

  it('flags an unreachable registry as remote error', async () => {
    listMock.mockResolvedValue({ '@rack': { url: 'https://r.com' } })
    getMock.mockRejectedValue(new Error('down'))
    const summary = await runChecks()
    const remote = summary.results.find((r) => r.id === 'remote.@rack')!
    expect(remote.level).toBe('error')
  })

  it('uses fallback detail when remote error is non-Error', async () => {
    listMock.mockResolvedValue({ '@rack': { url: 'https://r.com' } })
    getMock.mockRejectedValue('plain')
    const summary = await runChecks()
    const remote = summary.results.find((r) => r.id === 'remote.@rack')!
    expect(remote.details?.error).toBe('Unknown remote error')
  })

  it('strips trailing slashes before appending /health', async () => {
    listMock.mockResolvedValue({ '@rack': { url: 'https://r.com///' } })
    await runChecks()
    expect(getMock.mock.calls[0][0]).toBe('https://r.com/health')
  })
})
