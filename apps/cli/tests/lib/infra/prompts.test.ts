import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock `prompts` and `ora` before importing the SUT.
vi.mock('prompts', () => ({ default: vi.fn() }))
vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
    text: ''
  }))
}))

import inquirer from 'prompts'
import ora from 'ora'
import { Prompter } from '../../../src/lib/infra/prompts.js'
import { Logger } from '../../../src/lib/infra/logger.js'

const mockedInquirer = inquirer as unknown as ReturnType<typeof vi.fn>
const mockedOra = ora as unknown as ReturnType<typeof vi.fn>

describe('infra/prompts (interactive)', () => {
  beforeEach(() => {
    mockedInquirer.mockReset()
    mockedOra.mockClear()
  })
  afterEach(() => vi.restoreAllMocks())

  it('confirm returns the inquirer value', async () => {
    mockedInquirer.mockResolvedValue({ value: true })
    const prompter = new Prompter(false)
    expect(await prompter.confirm({ message: 'ok?' })).toBe(true)
  })

  it('confirm falls back to false when prompt is cancelled', async () => {
    mockedInquirer.mockResolvedValue({ value: undefined })
    const prompter = new Prompter(false)
    expect(await prompter.confirm({ message: 'ok?' })).toBe(false)
  })

  it('select returns the selected value', async () => {
    mockedInquirer.mockResolvedValue({ value: 'b' })
    const prompter = new Prompter(false)
    const got = await prompter.select({
      message: 'pick',
      choices: [
        { title: 'A', value: 'a' },
        { title: 'B', value: 'b' }
      ]
    })
    expect(got).toBe('b')
  })

  it('select returns null when prompt is cancelled', async () => {
    mockedInquirer.mockResolvedValue({ value: undefined })
    const prompter = new Prompter(false)
    expect(
      await prompter.select({
        message: 'x',
        choices: [{ title: 'A', value: 'a' }]
      })
    ).toBeNull()
  })

  it('text returns the entered value', async () => {
    mockedInquirer.mockResolvedValue({ value: 'my-project' })
    const prompter = new Prompter(false)
    expect(await prompter.text({ message: 'name' })).toBe('my-project')
  })

  it('text returns null when the prompt is cancelled', async () => {
    mockedInquirer.mockResolvedValue({ value: undefined })
    const prompter = new Prompter(false)
    expect(await prompter.text({ message: 'name' })).toBeNull()
  })

  it('spinner delegates to ora when not in CI mode', () => {
    const prompter = new Prompter(false)
    prompter.spinner('loading', '[Rack]')
    expect(mockedOra).toHaveBeenCalledWith({
      text: 'loading',
      prefixText: '[Rack]'
    })
  })
})

describe('infra/prompts (CI mode)', () => {
  it('confirm returns the initial value in CI mode', async () => {
    const prompter = new Prompter(true)
    expect(await prompter.confirm({ message: 'x', initial: true })).toBe(true)
    expect(await prompter.confirm({ message: 'y' })).toBe(false)
  })

  it('select returns the choice at the initial index in CI mode', async () => {
    const prompter = new Prompter(true)
    const v = await prompter.select({
      message: 'pick',
      initial: 1,
      choices: [
        { title: 'A', value: 'a' },
        { title: 'B', value: 'b' }
      ]
    })
    expect(v).toBe('b')
  })

  it('select returns null when initial index is out of range in CI mode', async () => {
    const prompter = new Prompter(true)
    const v = await prompter.select({
      message: 'pick',
      choices: [{ title: 'A', value: 'a' }],
      initial: 99
    })
    expect(v).toBeNull()
  })

  it('select returns null when the chosen value is nullish in CI mode', async () => {
    const prompter = new Prompter(true)
    const v = await prompter.select({
      message: 'pick',
      choices: [{ title: 'A', value: null as never }]
    })
    expect(v).toBeNull()
  })

  it('text returns initial value or null in CI mode', async () => {
    const prompter = new Prompter(true)
    expect(await prompter.text({ message: 'n', initial: 'x' })).toBe('x')
    expect(await prompter.text({ message: 'n' })).toBeNull()
  })

  it('spinner returns a silent no-op object in CI mode', () => {
    const prompter = new Prompter(true)
    const s = prompter.spinner('loading')
    expect(() => {
      s.start()
      s.succeed('ok')
      s.fail('x')
      s.stop()
    }).not.toThrow()
    expect(s.text).toBe('loading')
  })

  it('auto-detects CI mode from --ci CLI flag', async () => {
    const origArgv = process.argv
    process.argv = [...origArgv, '--ci']
    try {
      const prompter = new Prompter()
      expect(await prompter.text({ message: 'n' })).toBeNull()
    } finally {
      process.argv = origArgv
    }
  })
})

describe('infra/prompts withSpinner', () => {
  it('raises logger level during the call and restores it on completion', async () => {
    const logger = new Logger('info')
    const prompter = new Prompter(true)
    const observed: string[] = []

    const result = await prompter.withSpinner(logger, 'work', async () => {
      observed.push(logger.getLevel())
      return 'done'
    })

    expect(result).toBe('done')
    expect(observed).toEqual(['warn'])
    expect(logger.getLevel()).toBe('info')
  })

  it('restores the logger level even when the callback throws', async () => {
    const logger = new Logger('debug')
    const prompter = new Prompter(true)

    await expect(
      prompter.withSpinner(logger, 'work', async () => {
        throw new Error('fail')
      })
    ).rejects.toThrow('fail')

    expect(logger.getLevel()).toBe('debug')
  })
})
