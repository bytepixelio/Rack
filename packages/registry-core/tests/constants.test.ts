import { describe, it, expect } from 'vitest'
import {
  CACHE_HEADERS,
  SCHEMA_FILES,
  SEMVER_PATTERN,
  CATEGORY_BY_TYPE
} from '../src/constants.js'

describe('SEMVER_PATTERN', () => {
  it.each([
    ['1.0.0'],
    ['2.3.1'],
    ['10.20.30'],
    ['1.0.0-beta'],
    ['1.0.0-beta.1'],
    ['2.3.1+build'],
    ['1.0.0-rc.1+build.42']
  ])('matches %s', (v) => {
    expect(SEMVER_PATTERN.test(v)).toBe(true)
  })

  it.each([
    ['1'],
    ['1.0'],
    ['latest'],
    ['v1.0.0'],
    [''],
    ['01.0.0'],
    ['1.02.0'],
    ['1.0.03'],
    ['1.0.0evil'],
    ['1.0.0-beta!'],
    ['1.0.0+build/extra']
  ])('does not match %s', (v) => {
    expect(SEMVER_PATTERN.test(v)).toBe(false)
  })
})

describe('CATEGORY_BY_TYPE', () => {
  it('covers all six documented module-level types', () => {
    expect(CATEGORY_BY_TYPE).toEqual({
      'registry:runtime': 'runtimes',
      'registry:framework': 'frameworks',
      'registry:build': 'build',
      'registry:feature': 'features',
      'registry:testing': 'testing',
      'registry:quality': 'quality'
    })
  })
})

describe('SCHEMA_FILES', () => {
  it('whitelists the three public schema files', () => {
    expect([...SCHEMA_FILES].sort()).toEqual([
      'preset.json',
      'rack.json',
      'registry-item.json'
    ])
  })
})

describe('CACHE_HEADERS', () => {
  it('exposes the four documented tiers', () => {
    expect(CACHE_HEADERS).toEqual({
      none: 'no-store',
      short: 'public, max-age=60',
      long: 'public, max-age=86400',
      immutable: 'public, max-age=31536000, immutable'
    })
  })
})
