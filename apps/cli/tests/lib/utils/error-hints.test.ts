import { it, expect, describe } from 'vitest'
import {
  ERROR_HINTS,
  getErrorHint
} from '../../../src/lib/utils/error-hints.js'

describe('error-hints', () => {
  it('covers every AppError code thrown by the CLI', () => {
    const expected = [
      'TIMEOUT',
      'CONFLICT',
      'HTTP_ERROR',
      'MERGE_FAILED',
      'CONFIG_ERROR',
      'RACK_JSON_ERROR',
      'VALIDATION_ERROR',
      'INVALID_NAMESPACE',
      'REGISTRY_NOT_FOUND',
      'DUPLICATE_REGISTRY',
      'CIRCULAR_DEPENDENCY'
    ]
    for (const code of expected) {
      expect(ERROR_HINTS[code], `missing hint for ${code}`).toBeTypeOf('string')
    }
  })

  it('getErrorHint returns the hint for a known code', () => {
    expect(getErrorHint('REGISTRY_NOT_FOUND')).toContain('rk config set')
  })

  it('getErrorHint returns undefined for unknown codes', () => {
    expect(getErrorHint('NOPE')).toBeUndefined()
  })
})
