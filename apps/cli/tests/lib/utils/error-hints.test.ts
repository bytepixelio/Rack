import { it, expect, describe } from 'vitest'
import {
  ERROR_HINTS,
  getErrorHint
} from '../../../src/lib/utils/error-hints.js'

describe('error-hints', () => {
  it('covers every AppError code thrown by the CLI', () => {
    const expected = [
      'REGISTRY_NOT_FOUND',
      'INVALID_NAMESPACE',
      'CONFLICT',
      'CIRCULAR_DEPENDENCY',
      'RACK_JSON_ERROR',
      'CONFIG_ERROR',
      'HTTP_ERROR',
      'TIMEOUT',
      'MERGE_FAILED',
      'VALIDATION_ERROR'
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
