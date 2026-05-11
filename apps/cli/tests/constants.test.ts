import { it, expect, describe } from 'vitest'
import { DEFAULT_NAMESPACE, DEFAULT_REGISTRY_URL } from '../src/constants.js'

describe('constants', () => {
  it('exports DEFAULT_NAMESPACE as @rack', () => {
    expect(DEFAULT_NAMESPACE).toBe('@rack')
  })

  it('exports DEFAULT_REGISTRY_URL pointing to registry.rackjs.com', () => {
    expect(DEFAULT_REGISTRY_URL).toBe('https://registry.rackjs.com')
  })
})
