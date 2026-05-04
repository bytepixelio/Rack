import { describe, it, expect } from 'vitest'
import { parseRegistryUrl } from '../../src/lib/parser.js'

describe('parseRegistryUrl', () => {
  it('should parse versions path', () => {
    expect(parseRegistryUrl('/@rack/node/versions')).toEqual({
      type: 'versions',
      namespace: '@rack',
      segments: ['node']
    })
  })

  it('should parse nested versions path', () => {
    expect(parseRegistryUrl('/@rack/runtimes/node/versions')).toEqual({
      type: 'versions',
      namespace: '@rack',
      segments: ['runtimes', 'node']
    })
  })

  it('should parse latest path', () => {
    expect(parseRegistryUrl('/@rack/node')).toEqual({
      type: 'latest',
      namespace: '@rack',
      segments: ['node']
    })
  })

  it('should parse nested latest path', () => {
    expect(parseRegistryUrl('/@rack/runtimes/node')).toEqual({
      type: 'latest',
      namespace: '@rack',
      segments: ['runtimes', 'node']
    })
  })

  it('should parse versioned path', () => {
    expect(parseRegistryUrl('/@rack/node/1.0.0')).toEqual({
      type: 'versioned',
      namespace: '@rack',
      segments: ['node'],
      version: '1.0.0'
    })
  })

  it('should parse file path', () => {
    expect(parseRegistryUrl('/@rack/node/1.0.0/files/src/index.ts')).toEqual({
      type: 'file',
      namespace: '@rack',
      segments: ['node'],
      version: '1.0.0',
      filePath: 'src/index.ts'
    })
  })

  it('should parse nested file path', () => {
    expect(
      parseRegistryUrl('/@rack/runtimes/node/2.0.0/files/tsconfig.json')
    ).toEqual({
      type: 'file',
      namespace: '@rack',
      segments: ['runtimes', 'node'],
      version: '2.0.0',
      filePath: 'tsconfig.json'
    })
  })

  it('should return null for namespace only', () => {
    expect(parseRegistryUrl('/@rack')).toBeNull()
  })

  it('should return null for empty path', () => {
    expect(parseRegistryUrl('/')).toBeNull()
  })

  it('should return null when namespace lacks @ prefix', () => {
    expect(parseRegistryUrl('/rack/node')).toBeNull()
  })

  it('should return null when version follows namespace directly', () => {
    expect(parseRegistryUrl('/@rack/1.0.0')).toBeNull()
  })

  it('should treat /@rack/versions as latest for registry named "versions"', () => {
    expect(parseRegistryUrl('/@rack/versions')).toEqual({
      type: 'latest',
      namespace: '@rack',
      segments: ['versions']
    })
  })

  it('should return null when segment after version is not files', () => {
    expect(parseRegistryUrl('/@rack/node/1.0.0/other/file.ts')).toBeNull()
  })

  it('should return null when files segment has no file path', () => {
    expect(parseRegistryUrl('/@rack/node/1.0.0/files')).toBeNull()
  })
})
