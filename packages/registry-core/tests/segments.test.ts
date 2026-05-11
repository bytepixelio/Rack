import { it, expect, describe } from 'vitest'
import { deriveSegments } from '../src/segments.js'

describe('deriveSegments', () => {
  // ─── type → category ───────────────────────────────────────────────

  it('maps registry:runtime to runtimes/<name>', () => {
    expect(deriveSegments({ name: 'node', type: 'registry:runtime' })).toEqual([
      'runtimes',
      'node'
    ])
  })

  it('maps registry:framework to frameworks/<name>', () => {
    expect(deriveSegments({ name: 'vue', type: 'registry:framework' })).toEqual(
      ['frameworks', 'vue']
    )
  })

  it('maps registry:build to build/<name>', () => {
    expect(deriveSegments({ name: 'rollup', type: 'registry:build' })).toEqual([
      'build',
      'rollup'
    ])
  })

  it('maps registry:feature to features/<name>', () => {
    expect(
      deriveSegments({ name: 'vue-router', type: 'registry:feature' })
    ).toEqual(['features', 'vue-router'])
  })

  it('maps registry:testing to testing/<name>', () => {
    expect(
      deriveSegments({ name: 'vitest', type: 'registry:testing' })
    ).toEqual(['testing', 'vitest'])
  })

  it('maps registry:quality to quality/<name>', () => {
    expect(deriveSegments({ name: 'husky', type: 'registry:quality' })).toEqual(
      ['quality', 'husky']
    )
  })

  // ─── fallbacks ─────────────────────────────────────────────────────

  it('falls back to flat layout when type is unrecognized', () => {
    expect(
      deriveSegments({ name: 'foo', type: 'registry:custom-tool' })
    ).toEqual(['foo'])
  })

  it('falls back to flat layout when type is missing', () => {
    expect(deriveSegments({ name: 'foo' })).toEqual(['foo'])
  })

  // ─── explicit path override ────────────────────────────────────────

  it('honors explicit path field over type mapping', () => {
    expect(
      deriveSegments({
        name: 'vitest',
        type: 'registry:testing',
        path: 'quality/vitest'
      })
    ).toEqual(['quality', 'vitest'])
  })

  it('honors single-segment explicit path', () => {
    expect(deriveSegments({ name: 'foo', path: 'foo' })).toEqual(['foo'])
  })

  it('honors deep explicit path (3+ segments)', () => {
    expect(
      deriveSegments({ name: 'beta', path: 'experimental/legacy/beta' })
    ).toEqual(['experimental', 'legacy', 'beta'])
  })

  // ─── path/name validation ─────────────────────────────────────────

  it('throws when path leaf does not match name', () => {
    expect(() =>
      deriveSegments({ name: 'husky', path: 'quality/wrong-leaf' })
    ).toThrow('path "quality/wrong-leaf" must end with name "husky"')
  })

  it('throws when path is empty after splitting', () => {
    expect(() => deriveSegments({ name: 'husky', path: '/' })).toThrow(
      'path "/" must end with name "husky"'
    )
  })
})
