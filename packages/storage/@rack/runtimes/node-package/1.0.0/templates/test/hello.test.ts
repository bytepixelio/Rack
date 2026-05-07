import hello from '../src'
import { test, expect, describe } from 'vitest'

describe('Hello cases', () => {
  test('must be return the string value', () => {
    expect(hello('World!')).toBe('Hello World!')
  })
})
