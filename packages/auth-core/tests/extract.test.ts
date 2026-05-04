import { describe, it, expect } from 'vitest'

import { extractToken } from '../src/extract.js'

describe('extractToken', () => {
  it('parses Bearer token from Authorization header', () => {
    expect(extractToken('Bearer abc123', null)).toBe('abc123')
  })

  it('is case-insensitive on the Bearer prefix', () => {
    expect(extractToken('bearer xyz', null)).toBe('xyz')
    expect(extractToken('BEARER xyz', null)).toBe('xyz')
  })

  it('trims whitespace around the Bearer value', () => {
    expect(extractToken('Bearer   abc   ', null)).toBe('abc')
  })

  it('falls back to X-Registry-Token when Authorization is absent', () => {
    expect(extractToken(null, 'registry-token')).toBe('registry-token')
  })

  it('trims whitespace on X-Registry-Token', () => {
    expect(extractToken(null, '  token  ')).toBe('token')
  })

  it('returns null when neither header is present', () => {
    expect(extractToken(null, null)).toBeNull()
    expect(extractToken(undefined, undefined)).toBeNull()
  })

  it('returns null when Authorization is not a Bearer scheme', () => {
    expect(extractToken('Basic abc', null)).toBeNull()
  })

  it('returns null when X-Registry-Token is whitespace only', () => {
    expect(extractToken(null, '   ')).toBeNull()
  })

  it('prefers Authorization over X-Registry-Token when both present', () => {
    expect(extractToken('Bearer from-auth', 'from-x')).toBe('from-auth')
  })
})
