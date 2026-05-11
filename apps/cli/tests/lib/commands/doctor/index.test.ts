import {
  it,
  vi,
  expect,
  describe,
  afterEach,
  beforeEach,
  type MockInstance
} from 'vitest'

vi.mock('../../../../src/lib/commands/doctor/checks.js', () => ({
  runChecks: vi.fn()
}))

const prompterMocks = vi.hoisted(() => ({
  withSpinner: vi.fn(async (_l: unknown, _t: string, fn: () => unknown) => fn())
}))
vi.mock('../../../../src/lib/infra/prompts.js', () => ({
  Prompter: class {
    withSpinner = prompterMocks.withSpinner
  }
}))

import { runCommand } from '../helpers.js'
import { runChecks } from '../../../../src/lib/commands/doctor/checks.js'
import { registerDoctorCommand } from '../../../../src/lib/commands/doctor/index.js'

const runChecksMock = runChecks as unknown as ReturnType<typeof vi.fn>

let logSpy: MockInstance<typeof console.log>
let infoSpy: MockInstance<typeof console.info>
let exitSpy: MockInstance<typeof process.exit>

beforeEach(() => {
  runChecksMock.mockReset()
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('__exit__')
  })
})
afterEach(() => vi.restoreAllMocks())

describe('doctor command', () => {
  it('prints human-readable report when all checks pass', async () => {
    runChecksMock.mockResolvedValue({
      hasErrors: false,
      results: [
        {
          id: 'env.node-version',
          level: 'info',
          category: 'environment',
          message: 'ok'
        }
      ]
    })
    await runCommand(registerDoctorCommand, ['doctor'])
    const out = infoSpy.mock.calls.flat().join(' ')
    expect(out).toContain('All checks passed')
  })

  it('exits with code 1 when hasErrors is true', async () => {
    runChecksMock.mockResolvedValue({
      hasErrors: true,
      results: [
        {
          id: 'env.node-version',
          level: 'error',
          category: 'environment',
          message: 'bad'
        }
      ]
    })
    await expect(runCommand(registerDoctorCommand, ['doctor'])).rejects.toThrow(
      '__exit__'
    )
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('outputs JSON when --json is set', async () => {
    runChecksMock.mockResolvedValue({ hasErrors: false, results: [] })
    await runCommand(registerDoctorCommand, ['doctor', '--json'])
    expect(JSON.parse(logSpy.mock.calls[0][0] as string)).toEqual({
      hasErrors: false,
      results: []
    })
  })

  it('exits with error when runChecks throws', async () => {
    runChecksMock.mockRejectedValue(new Error('boom'))
    await expect(runCommand(registerDoctorCommand, ['doctor'])).rejects.toThrow(
      '__exit__'
    )
  })
})
