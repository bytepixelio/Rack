import { it, expect, describe } from 'vitest'
import {
  buildFileKey,
  buildRegistryKey,
  buildVersionsKey,
  buildRegistryDirKey
} from '../src/keys.js'

describe('buildRegistryDirKey', () => {
  it('joins single-segment locator', () => {
    expect(
      buildRegistryDirKey({ namespace: '@rack', segments: ['node'] })
    ).toBe('@rack/node')
  })

  it('joins multi-segment locator', () => {
    expect(
      buildRegistryDirKey({
        namespace: '@rack',
        segments: ['quality', 'husky']
      })
    ).toBe('@rack/quality/husky')
  })
})

describe('buildVersionsKey', () => {
  it('appends versions.json to single-segment dir', () => {
    expect(buildVersionsKey({ namespace: '@rack', segments: ['node'] })).toBe(
      '@rack/node/versions.json'
    )
  })

  it('appends versions.json to multi-segment dir', () => {
    expect(
      buildVersionsKey({
        namespace: '@rack',
        segments: ['quality', 'husky']
      })
    ).toBe('@rack/quality/husky/versions.json')
  })
})

describe('buildRegistryKey', () => {
  it('builds versioned registry.json key (single segment)', () => {
    expect(
      buildRegistryKey({
        namespace: '@rack',
        segments: ['node'],
        version: '1.0.0'
      })
    ).toBe('@rack/node/1.0.0/registry.json')
  })

  it('builds versioned registry.json key (multi segment)', () => {
    expect(
      buildRegistryKey({
        namespace: '@rack',
        segments: ['quality', 'husky'],
        version: '1.0.1'
      })
    ).toBe('@rack/quality/husky/1.0.1/registry.json')
  })
})

describe('buildFileKey', () => {
  it('builds template file key (single segment)', () => {
    expect(
      buildFileKey({
        namespace: '@rack',
        segments: ['node'],
        version: '1.0.0',
        filePath: 'src/index.ts'
      })
    ).toBe('@rack/node/1.0.0/src/index.ts')
  })

  it('builds template file key (multi segment, nested filePath)', () => {
    expect(
      buildFileKey({
        namespace: '@rack',
        segments: ['quality', 'husky'],
        version: '1.0.0',
        filePath: 'templates/.husky/commit-msg'
      })
    ).toBe('@rack/quality/husky/1.0.0/templates/.husky/commit-msg')
  })
})
