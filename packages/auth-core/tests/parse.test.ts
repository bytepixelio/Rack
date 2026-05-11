import { it, expect, describe } from 'vitest'

import { emptyAuthConfig, parseAuthConfig } from '../src/parse.js'

describe('parseAuthConfig', () => {
  it('returns empty maps and no errors for an empty object', () => {
    const config = parseAuthConfig({})
    expect(config.allowedNamespaces.size).toBe(0)
    expect(config.tokens.size).toBe(0)
    expect(config.errors).toEqual([])
  })

  it('registers an anonymous namespace (empty token array)', () => {
    const config = parseAuthConfig({ '@public': [] })
    expect(config.allowedNamespaces.has('@public')).toBe(true)
    expect(config.tokens.has('@public')).toBe(false)
    expect(config.errors).toEqual([])
  })

  it('isolates a non-array namespace value into errors, not allowed', () => {
    const config = parseAuthConfig({ '@ns': null })
    expect(config.allowedNamespaces.has('@ns')).toBe(false)
    expect(config.errors).toEqual([
      {
        namespace: '@ns',
        reason: expect.stringContaining('must map to an array')
      }
    ])
  })

  it('registers a namespace with tokens', () => {
    const config = parseAuthConfig({
      '@priv': [{ token: 'abc', publish: true, mark: 'CI' }]
    })
    expect(config.tokens.get('@priv')?.get('abc')).toMatchObject({
      token: 'abc',
      mark: 'CI',
      publish: true
    })
    expect(config.errors).toEqual([])
  })

  it('parses expiresAt as a Date', () => {
    const config = parseAuthConfig({
      '@priv': [{ token: 'abc', publish: true, expiresAt: '2030-01-01' }]
    })
    expect(config.tokens.get('@priv')?.get('abc')?.expiresAt).toBeInstanceOf(
      Date
    )
  })

  it('isolates an invalid expiresAt date string into errors', () => {
    const config = parseAuthConfig({
      '@priv': [{ token: 'abc', publish: true, expiresAt: 'not-a-date' }]
    })
    expect(config.allowedNamespaces.has('@priv')).toBe(false)
    expect(config.tokens.has('@priv')).toBe(false)
    expect(config.errors).toEqual([
      {
        namespace: '@priv',
        reason: expect.stringContaining('invalid expiresAt')
      }
    ])
  })

  it('isolates a non-string expiresAt into errors', () => {
    const config = parseAuthConfig({
      '@priv': [{ token: 'abc', publish: true, expiresAt: 12345 }]
    })
    expect(config.allowedNamespaces.has('@priv')).toBe(false)
    expect(config.errors[0]?.reason).toMatch(/must be an ISO-8601 date string/)
  })

  it('treats an empty expiresAt string as never-expires', () => {
    const config = parseAuthConfig({
      '@priv': [{ token: 'abc', publish: true, expiresAt: '' }]
    })
    expect(config.tokens.get('@priv')?.get('abc')?.expiresAt).toBeUndefined()
  })

  it('trims surrounding whitespace on token keys', () => {
    const config = parseAuthConfig({
      '@priv': [{ token: '  abc  ', publish: true }]
    })
    expect(config.tokens.get('@priv')?.get('abc')).toBeDefined()
  })

  it('defaults publish to false when not strictly true', () => {
    const config = parseAuthConfig({
      '@priv': [{ token: 'abc', publish: 'yes' }]
    })
    expect(config.tokens.get('@priv')?.get('abc')?.publish).toBe(false)
  })

  it('skips non-object entries in a token array', () => {
    const config = parseAuthConfig({
      '@priv': [null, 42, 'string', { token: 'ok', publish: true }]
    })
    expect(config.tokens.get('@priv')?.size).toBe(1)
  })

  it('isolates a namespace where all token entries lack a valid token string', () => {
    const config = parseAuthConfig({
      '@priv': [{ publish: true }, { token: '', publish: true }]
    })
    expect(config.allowedNamespaces.has('@priv')).toBe(false)
    expect(config.errors[0]?.reason).toContain(
      'none contain a valid "token" string'
    )
  })

  it('ignores non-string mark fields', () => {
    const config = parseAuthConfig({
      '@priv': [{ token: 'abc', publish: true, mark: 42 }]
    })
    expect(config.tokens.get('@priv')?.get('abc')?.mark).toBeUndefined()
  })

  it('isolates a namespace value that is not an array', () => {
    const config = parseAuthConfig({ '@priv': 'not-an-array' as never })
    expect(config.allowedNamespaces.has('@priv')).toBe(false)
    expect(config.errors[0]?.reason).toContain('must map to an array')
  })

  it('isolates a namespace where all entries are non-object', () => {
    const config = parseAuthConfig({ '@priv': [null, 42, 'x'] })
    expect(config.allowedNamespaces.has('@priv')).toBe(false)
    expect(config.errors[0]?.reason).toContain(
      'none contain a valid "token" string'
    )
  })

  it('isolates a broken namespace without affecting siblings', () => {
    const config = parseAuthConfig({
      '@good': [{ token: 'abc', publish: true }],
      '@bad': [{ token: 'xyz', publish: true, expiresAt: 'oops' }],
      '@anon': []
    })

    expect(config.allowedNamespaces.has('@good')).toBe(true)
    expect(config.allowedNamespaces.has('@anon')).toBe(true)
    expect(config.allowedNamespaces.has('@bad')).toBe(false)

    expect(config.tokens.get('@good')?.get('abc')).toBeDefined()
    expect(config.tokens.has('@bad')).toBe(false)

    expect(config.errors).toEqual([
      {
        namespace: '@bad',
        reason: expect.stringContaining('invalid expiresAt')
      }
    ])
  })

  it('throws when the top-level value is not an object', () => {
    expect(() => parseAuthConfig(null)).toThrow('must be an object')
    expect(() => parseAuthConfig('x')).toThrow('must be an object')
    expect(() => parseAuthConfig([])).toThrow('must be an object')
  })
})

describe('emptyAuthConfig', () => {
  it('returns a fresh empty config with no errors', () => {
    const config = emptyAuthConfig()
    expect(config.tokens.size).toBe(0)
    expect(config.allowedNamespaces.size).toBe(0)
    expect(config.errors).toEqual([])
  })
})
