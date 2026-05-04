import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Logger } from '../../../src/lib/infra/logger.js'
import {
  AppError,
  RegistryNotFoundError
} from '../../../src/lib/utils/errors.js'

describe('infra/logger', () => {
  let debug: ReturnType<typeof vi.spyOn>
  let info: ReturnType<typeof vi.spyOn>
  let warn: ReturnType<typeof vi.spyOn>
  let error: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
    info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => vi.restoreAllMocks())

  it('filters debug messages at default info level and forwards others with prefix', () => {
    const logger = new Logger()
    logger.debug('d', 1)
    logger.info('i', 'x')
    logger.warn('w')
    logger.error('e')
    expect(debug).not.toHaveBeenCalled()
    expect(info).toHaveBeenCalledWith('[Rack] i', 'x')
    expect(warn).toHaveBeenCalledWith('[Rack] w')
    expect(error).toHaveBeenCalledWith('[Rack] e')
  })

  it('emits debug messages when the initial level is debug', () => {
    const logger = new Logger('debug')
    logger.debug('hello', { a: 1 })
    expect(debug).toHaveBeenCalledWith('[Rack] hello', { a: 1 })
  })

  it('suppresses all output at silent level', () => {
    const logger = new Logger('silent')
    logger.debug('d')
    logger.info('i')
    logger.warn('w')
    logger.error('e')
    expect(debug).not.toHaveBeenCalled()
    expect(info).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it('setLevel changes the runtime level and getLevel reports it', () => {
    const logger = new Logger()
    expect(logger.getLevel()).toBe('info')
    logger.setLevel('warn')
    expect(logger.getLevel()).toBe('warn')
    logger.info('skipped')
    logger.warn('kept')
    expect(info).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
  })

  it('commandError emits standardized red error format for plain Error', () => {
    const logger = new Logger()
    logger.commandError('Add', new Error('boom'))
    const call = error.mock.calls[0][0] as string
    expect(call).toContain('✗ Add command: boom')
    // No code / hint for non-AppError values.
    expect(error.mock.calls).toHaveLength(1)
  })

  it('commandError stringifies non-Error values', () => {
    const logger = new Logger()
    logger.commandError('Init', 'plain')
    const call = error.mock.calls[0][0] as string
    expect(call).toContain('plain')
  })

  it('commandError prints [CODE] and Hint line for AppError with known code', () => {
    const logger = new Logger()
    logger.commandError(
      'Add',
      new RegistryNotFoundError('No registry configured for @corp', '@corp')
    )
    expect(error.mock.calls).toHaveLength(2)
    const head = error.mock.calls[0][0] as string
    const hint = error.mock.calls[1][0] as string
    expect(head).toContain('[REGISTRY_NOT_FOUND]')
    expect(head).toContain('No registry configured for @corp')
    expect(hint).toContain('Hint:')
    expect(hint).toContain("'rk config set")
  })

  it('commandError prints [CODE] but no Hint when code is unknown', () => {
    const logger = new Logger()
    logger.commandError('Add', new AppError('UNKNOWN_CODE', 'mystery'))
    expect(error.mock.calls).toHaveLength(1)
    expect(error.mock.calls[0][0]).toContain('[UNKNOWN_CODE]')
  })
})
