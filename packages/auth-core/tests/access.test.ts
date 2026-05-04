import { describe, it, expect } from 'vitest'
import { parseAuthConfig } from '../src/parse.js'
import {
  verifyAccess,
  isNamespaceAllowed,
  isNamespaceAnonymous
} from '../src/access.js'

describe('isNamespaceAllowed', () => {
  it('returns true for a declared namespace with tokens', () => {
    const config = parseAuthConfig({
      '@priv': [{ token: 'x', publish: true }]
    })
    expect(isNamespaceAllowed(config, '@priv')).toBe(true)
  })

  it('returns true for a declared anonymous namespace', () => {
    const config = parseAuthConfig({ '@pub': [] })
    expect(isNamespaceAllowed(config, '@pub')).toBe(true)
  })

  it('returns false for an undeclared namespace', () => {
    const config = parseAuthConfig({ '@pub': [] })
    expect(isNamespaceAllowed(config, '@other')).toBe(false)
  })
})

describe('isNamespaceAnonymous', () => {
  it('returns true when no tokens configured', () => {
    const config = parseAuthConfig({ '@pub': [] })
    expect(isNamespaceAnonymous(config, '@pub')).toBe(true)
  })

  it('returns false when tokens are configured', () => {
    const config = parseAuthConfig({
      '@priv': [{ token: 'x', publish: true }]
    })
    expect(isNamespaceAnonymous(config, '@priv')).toBe(false)
  })

  it('returns true for an undeclared namespace (no tokens stored)', () => {
    const config = parseAuthConfig({})
    expect(isNamespaceAnonymous(config, '@missing')).toBe(true)
  })
})

describe('verifyAccess', () => {
  it('allows access for anonymous namespace regardless of token', () => {
    const config = parseAuthConfig({ '@pub': [] })
    const result = verifyAccess(config, '@pub', null)
    expect(result.allowed).toBe(true)
    expect(result.reason).toBe('anonymous')
  })

  it('authorizes a matching token', () => {
    const config = parseAuthConfig({
      '@priv': [{ token: 'secret', publish: true, mark: 'CI' }]
    })
    const result = verifyAccess(config, '@priv', 'secret')
    expect(result.allowed).toBe(true)
    expect(result.reason).toBe('authorized')
    expect(result.token?.mark).toBe('CI')
    expect(result.token?.publish).toBe(true)
  })

  it('trims the provided token before matching', () => {
    const config = parseAuthConfig({
      '@priv': [{ token: 'secret', publish: true }]
    })
    expect(verifyAccess(config, '@priv', '  secret  ').allowed).toBe(true)
  })

  it('denies when no token provided to a gated namespace', () => {
    const config = parseAuthConfig({
      '@priv': [{ token: 'secret', publish: true }]
    })
    const result = verifyAccess(config, '@priv', null)
    expect(result.allowed).toBe(false)
    expect(result.error?.code).toBe('UNAUTHORIZED')
    expect(result.error?.statusCode).toBe(401)
  })

  it('denies an invalid token', () => {
    const config = parseAuthConfig({
      '@priv': [{ token: 'correct', publish: true }]
    })
    const result = verifyAccess(config, '@priv', 'wrong')
    expect(result.allowed).toBe(false)
    expect(result.error?.code).toBe('INVALID_TOKEN')
  })

  it('denies a token from a different namespace', () => {
    const config = parseAuthConfig({
      '@one': [{ token: 'a', publish: true }],
      '@two': [{ token: 'b', publish: true }]
    })
    const result = verifyAccess(config, '@one', 'b')
    expect(result.allowed).toBe(false)
    expect(result.error?.code).toBe('INVALID_TOKEN')
  })

  it('denies an expired token', () => {
    const config = parseAuthConfig({
      '@priv': [{ token: 'old', publish: true, expiresAt: '2020-01-01' }]
    })
    const result = verifyAccess(config, '@priv', 'old')
    expect(result.allowed).toBe(false)
    expect(result.error?.code).toBe('TOKEN_EXPIRED')
  })

  it('accepts a token whose expiresAt is in the future', () => {
    const config = parseAuthConfig({
      '@priv': [{ token: 'ok', publish: true, expiresAt: '2099-01-01' }]
    })
    expect(verifyAccess(config, '@priv', 'ok').allowed).toBe(true)
  })

  it('uses the provided now for expiry comparison', () => {
    const config = parseAuthConfig({
      '@priv': [{ token: 't', publish: true, expiresAt: '2025-06-01' }]
    })
    const beforeExpiry = verifyAccess(
      config,
      '@priv',
      't',
      new Date('2025-01-01')
    )
    const afterExpiry = verifyAccess(
      config,
      '@priv',
      't',
      new Date('2026-01-01')
    )
    expect(beforeExpiry.allowed).toBe(true)
    expect(afterExpiry.allowed).toBe(false)
    expect(afterExpiry.error?.code).toBe('TOKEN_EXPIRED')
  })
})
