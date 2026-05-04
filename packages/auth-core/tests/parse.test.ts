import { describe, it, expect } from 'vitest'

import { parseAuthConfig, emptyAuthConfig } from '../src/parse.js'

describe('parseAuthConfig', () => {
  it('returns empty maps for an empty object', () => {
    const config = parseAuthConfig({})
    expect(config.allowedNamespaces.size).toBe(0)
    expect(config.tokens.size).toBe(0)
  })

  it('registers an anonymous namespace (empty token array)', () => {
    const config = parseAuthConfig({ '@public': [] })
    expect(config.allowedNamespaces.has('@public')).toBe(true)
    expect(config.tokens.has('@public')).toBe(false)
  })

  it('registers an anonymous namespace when value is null', () => {
    const config = parseAuthConfig({ '@ns': null })
    expect(config.allowedNamespaces.has('@ns')).toBe(true)
    expect(config.tokens.has('@ns')).toBe(false)
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
  })

  it('parses expiresAt as a Date', () => {
    const config = parseAuthConfig({
      '@priv': [{ token: 'abc', publish: true, expiresAt: '2030-01-01' }]
    })
    expect(config.tokens.get('@priv')?.get('abc')?.expiresAt).toBeInstanceOf(
      Date
    )
  })

  it('drops tokens with invalid date strings (no expiration)', () => {
    const config = parseAuthConfig({
      '@priv': [{ token: 'abc', publish: true, expiresAt: 'not-a-date' }]
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

  it('skips entries missing a token string', () => {
    const config = parseAuthConfig({
      '@priv': [{ publish: true }, { token: '', publish: true }]
    })
    expect(config.tokens.has('@priv')).toBe(false)
    expect(config.allowedNamespaces.has('@priv')).toBe(true)
  })

  it('ignores non-string mark fields', () => {
    const config = parseAuthConfig({
      '@priv': [{ token: 'abc', publish: true, mark: 42 }]
    })
    expect(config.tokens.get('@priv')?.get('abc')?.mark).toBeUndefined()
  })

  it('treats non-array namespace values as anonymous', () => {
    const config = parseAuthConfig({ '@priv': 'not-an-array' as never })
    expect(config.allowedNamespaces.has('@priv')).toBe(true)
    expect(config.tokens.has('@priv')).toBe(false)
  })

  it('throws when the top-level value is not an object', () => {
    expect(() => parseAuthConfig(null)).toThrow('must be an object')
    expect(() => parseAuthConfig('x')).toThrow('must be an object')
    expect(() => parseAuthConfig([])).toThrow('must be an object')
  })
})

describe('emptyAuthConfig', () => {
  it('returns a fresh empty config', () => {
    const config = emptyAuthConfig()
    expect(config.tokens.size).toBe(0)
    expect(config.allowedNamespaces.size).toBe(0)
  })
})
