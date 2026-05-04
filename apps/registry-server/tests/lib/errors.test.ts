import { describe, it, expect } from 'vitest'
import {
  AppError,
  ConflictError,
  NotFoundError,
  ForbiddenError,
  ValidationError
} from '../../src/lib/errors.js'

describe('AppError', () => {
  it('should set code, message and statusCode', () => {
    const error = new AppError('TEST_ERROR', 'something went wrong', 418)
    expect(error.code).toBe('TEST_ERROR')
    expect(error.message).toBe('something went wrong')
    expect(error.statusCode).toBe(418)
  })

  it('should default statusCode to 500', () => {
    const error = new AppError('FAIL', 'oops')
    expect(error.statusCode).toBe(500)
  })

  it('should set name to class name', () => {
    const error = new AppError('X', 'x')
    expect(error.name).toBe('AppError')
  })

  it('should be an instance of Error', () => {
    const error = new AppError('X', 'x')
    expect(error).toBeInstanceOf(Error)
  })
})

describe('NotFoundError', () => {
  it('should have statusCode 404', () => {
    const error = new NotFoundError('NOT_FOUND', 'gone')
    expect(error.statusCode).toBe(404)
  })

  it('should be an instance of AppError', () => {
    expect(new NotFoundError('X', 'x')).toBeInstanceOf(AppError)
  })
})

describe('ForbiddenError', () => {
  it('should have statusCode 403', () => {
    const error = new ForbiddenError('FORBIDDEN', 'denied')
    expect(error.statusCode).toBe(403)
  })

  it('should be an instance of AppError', () => {
    expect(new ForbiddenError('X', 'x')).toBeInstanceOf(AppError)
  })
})

describe('ConflictError', () => {
  it('should have statusCode 409', () => {
    const error = new ConflictError('CONFLICT', 'exists')
    expect(error.statusCode).toBe(409)
  })

  it('should be an instance of AppError', () => {
    expect(new ConflictError('X', 'x')).toBeInstanceOf(AppError)
  })
})

describe('ValidationError', () => {
  it('should have statusCode 400', () => {
    const error = new ValidationError('INVALID', 'bad input')
    expect(error.statusCode).toBe(400)
  })

  it('should be an instance of AppError', () => {
    expect(new ValidationError('X', 'x')).toBeInstanceOf(AppError)
  })
})
