import { it, expect, describe } from 'vitest'
import {
  AppError,
  HttpError,
  MergeError,
  ConfigError,
  TimeoutError,
  ConflictError,
  RackJsonError,
  getErrorMessage,
  InvalidNamespaceError,
  RegistryNotFoundError,
  CircularDependencyError
} from '../../../src/lib/utils/errors.js'

describe('utils/errors', () => {
  it('getErrorMessage returns message for Error instances', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom')
  })

  it('getErrorMessage stringifies non-Error values', () => {
    expect(getErrorMessage('x')).toBe('x')
    expect(getErrorMessage(42)).toBe('42')
    expect(getErrorMessage(null)).toBe('null')
  })

  it('AppError carries a machine-readable code and sets name to class name', () => {
    const e = new AppError('X', 'msg')
    expect(e.code).toBe('X')
    expect(e.name).toBe('AppError')
    expect(e.message).toBe('msg')
    expect(e).toBeInstanceOf(Error)
  })

  it('HttpError carries status and response payload', () => {
    const e = new HttpError('fail', 404, { err: 'x' })
    expect(e.status).toBe(404)
    expect(e.response).toEqual({ err: 'x' })
    expect(e.code).toBe('HTTP_ERROR')
  })

  it('TimeoutError uses code TIMEOUT', () => {
    expect(new TimeoutError('slow').code).toBe('TIMEOUT')
  })

  it('InvalidNamespaceError keeps the offending identifier', () => {
    const e = new InvalidNamespaceError('bad', '@x/')
    expect(e.identifier).toBe('@x/')
    expect(e.code).toBe('INVALID_NAMESPACE')
  })

  it('RegistryNotFoundError keeps the queried identifier', () => {
    const e = new RegistryNotFoundError('missing', '@rack/vue')
    expect(e.identifier).toBe('@rack/vue')
    expect(e.code).toBe('REGISTRY_NOT_FOUND')
  })

  it('ConflictError stores the full list of conflicts', () => {
    const e = new ConflictError('x', [{ identifier: 'a', conflictsWith: 'b' }])
    expect(e.conflicts[0].identifier).toBe('a')
  })

  it('CircularDependencyError stores the cycle path', () => {
    expect(new CircularDependencyError('c', ['a', 'b', 'a']).cycle).toEqual([
      'a',
      'b',
      'a'
    ])
  })

  it('MergeError stores the failing file path', () => {
    expect(new MergeError('bad', 'pkg.json').filePath).toBe('pkg.json')
  })

  it('RackJsonError carries an optional errorCode', () => {
    expect(new RackJsonError('m', 'NOT_FOUND').errorCode).toBe('NOT_FOUND')
    expect(new RackJsonError('m').errorCode).toBeUndefined()
  })

  it('ConfigError uses code CONFIG_ERROR', () => {
    expect(new ConfigError('bad').code).toBe('CONFIG_ERROR')
  })
})
