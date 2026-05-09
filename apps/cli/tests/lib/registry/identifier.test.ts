import { describe, it, expect } from 'vitest'
import {
  isPreset,
  parseNamespace
} from '../../../src/lib/registry/identifier.js'
import { InvalidNamespaceError } from '../../../src/lib/utils/errors.js'

describe('registry/identifier', () => {
  it('parseNamespace falls back to @rack for bare names', () => {
    expect(parseNamespace('node-ts')).toEqual({
      namespace: '@rack',
      path: 'node-ts'
    })
  })

  it('parseNamespace splits @namespace/path form', () => {
    expect(parseNamespace('@rack/runtimes/node')).toEqual({
      namespace: '@rack',
      path: 'runtimes/node'
    })
  })

  it('parseNamespace extracts @version suffix', () => {
    expect(parseNamespace('nextjs@14.0.0')).toEqual({
      namespace: '@rack',
      path: 'nextjs',
      version: '14.0.0'
    })
  })

  it('parseNamespace extracts :ts / :js language suffix', () => {
    expect(parseNamespace('@rack/vue@1.0.0:ts')).toEqual({
      namespace: '@rack',
      path: 'vue',
      version: '1.0.0',
      language: 'ts'
    })
    expect(parseNamespace('@rack/vue:js')).toMatchObject({ language: 'js' })
  })

  it('parseNamespace normalizes namespace and path to lowercase', () => {
    expect(parseNamespace('@ACME/Runtimes/Node')).toEqual({
      namespace: '@acme',
      path: 'runtimes/node'
    })
  })

  it('parseNamespace throws for empty or whitespace-only input', () => {
    expect(() => parseNamespace('')).toThrow(InvalidNamespaceError)
    expect(() => parseNamespace('   ')).toThrow(InvalidNamespaceError)
  })

  it('parseNamespace rejects @namespace without a following slash', () => {
    expect(() => parseNamespace('@rack')).toThrow(InvalidNamespaceError)
  })

  it('parseNamespace rejects invalid namespace formats', () => {
    expect(() => parseNamespace('@bad_/name')).toThrow(InvalidNamespaceError)
  })

  it('parseNamespace rejects an empty version (trailing @)', () => {
    expect(() => parseNamespace('vue@')).toThrow(InvalidNamespaceError)
  })

  it('parseNamespace rejects a non-semver version', () => {
    expect(() => parseNamespace('runtimes/node@1/2')).toThrow(
      InvalidNamespaceError
    )
    expect(() => parseNamespace('runtimes/node@latest')).toThrow(
      InvalidNamespaceError
    )
  })

  it('parseNamespace rejects empty path segments', () => {
    expect(() => parseNamespace('@rack/a//b')).toThrow(InvalidNamespaceError)
  })

  it('parseNamespace rejects empty path after namespace', () => {
    expect(() => parseNamespace('@rack/')).toThrow(InvalidNamespaceError)
  })

  it('parseNamespace rejects path segments with invalid characters', () => {
    expect(() => parseNamespace('@rack/foo_bar')).toThrow(InvalidNamespaceError)
  })

  it('isPreset detects the @presets/ prefix only', () => {
    expect(isPreset('@presets/vue')).toBe(true)
    expect(isPreset('@rack/vue')).toBe(false)
    expect(isPreset('vue')).toBe(false)
  })

  it('isPreset matches case-insensitively via parseNamespace', () => {
    expect(isPreset('@Presets/vue')).toBe(true)
    expect(isPreset('@PRESETS/vue')).toBe(true)
  })

  it('isPreset returns false for unparseable identifiers', () => {
    expect(isPreset('')).toBe(false)
    expect(isPreset('@no-slash')).toBe(false)
  })
})
