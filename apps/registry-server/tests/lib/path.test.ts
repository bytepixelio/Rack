import { describe, it, expect } from 'vitest'
import {
  resolveFilePath,
  parseRegistryUrl,
  resolvePresetPath,
  resolveSchemaPath,
  resolveRegistryPath,
  resolveVersionsPath
} from '../../src/lib/path.js'

describe('parseRegistryUrl', () => {
  it('should parse versions path', () => {
    const result = parseRegistryUrl('/@rack/node/versions')
    expect(result).toEqual({
      type: 'versions',
      path: { namespace: '@rack', segments: ['node'] }
    })
  })

  it('should parse nested versions path', () => {
    const result = parseRegistryUrl('/@rack/runtimes/node/versions')
    expect(result).toEqual({
      type: 'versions',
      path: { namespace: '@rack', segments: ['runtimes', 'node'] }
    })
  })

  it('should parse latest path', () => {
    const result = parseRegistryUrl('/@rack/node')
    expect(result).toEqual({
      type: 'latest',
      path: { namespace: '@rack', segments: ['node'] }
    })
  })

  it('should parse nested latest path', () => {
    const result = parseRegistryUrl('/@rack/runtimes/node')
    expect(result).toEqual({
      type: 'latest',
      path: { namespace: '@rack', segments: ['runtimes', 'node'] }
    })
  })

  it('should parse versioned path', () => {
    const result = parseRegistryUrl('/@rack/node/1.0.0')
    expect(result).toEqual({
      type: 'versioned',
      path: { namespace: '@rack', segments: ['node'], version: '1.0.0' }
    })
  })

  it('should parse file path', () => {
    const result = parseRegistryUrl('/@rack/node/1.0.0/files/src/index.ts')
    expect(result).toEqual({
      type: 'file',
      path: {
        namespace: '@rack',
        segments: ['node'],
        version: '1.0.0',
        filePath: 'src/index.ts'
      }
    })
  })

  it('should parse nested file path', () => {
    const result = parseRegistryUrl(
      '/@rack/runtimes/node/2.0.0/files/tsconfig.json'
    )
    expect(result).toEqual({
      type: 'file',
      path: {
        namespace: '@rack',
        segments: ['runtimes', 'node'],
        version: '2.0.0',
        filePath: 'tsconfig.json'
      }
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
    const result = parseRegistryUrl('/@rack/versions')
    expect(result).toEqual({
      type: 'latest',
      path: { namespace: '@rack', segments: ['versions'] }
    })
  })

  it('should return null when segment after version is not files', () => {
    expect(parseRegistryUrl('/@rack/node/1.0.0/other/file.ts')).toBeNull()
  })

  it('should return null when files segment has no file path', () => {
    expect(parseRegistryUrl('/@rack/node/1.0.0/files')).toBeNull()
  })
})

describe('resolveRegistryPath', () => {
  it('should resolve versioned registry path', () => {
    const result = resolveRegistryPath('/storage', '@rack', ['node'], '1.0.0')
    expect(result).toContain('@rack/node/1.0.0/registry.json')
  })

  it('should resolve nested registry path', () => {
    const result = resolveRegistryPath(
      '/storage',
      '@rack',
      ['runtimes', 'node'],
      '2.0.0'
    )
    expect(result).toContain('@rack/runtimes/node/2.0.0/registry.json')
  })

  it('should throw on path traversal', () => {
    expect(() =>
      resolveRegistryPath('/storage', '@rack', ['..', '..', 'etc'], '1.0.0')
    ).toThrow('Path traversal detected')
  })
})

describe('resolveFilePath', () => {
  it('should resolve template file path', () => {
    const result = resolveFilePath(
      '/storage',
      '@rack',
      ['node'],
      '1.0.0',
      'src/index.ts'
    )
    expect(result).toContain('@rack/node/1.0.0/src/index.ts')
  })

  it('should throw on path traversal', () => {
    expect(() =>
      resolveFilePath(
        '/storage',
        '@rack',
        ['node'],
        '1.0.0',
        '../../../../etc/passwd'
      )
    ).toThrow('Path traversal detected')
  })
})

describe('resolveVersionsPath', () => {
  it('should resolve versions.json path', () => {
    const result = resolveVersionsPath('/storage', '@rack', ['node'])
    expect(result).toContain('@rack/node/versions.json')
  })

  it('should throw on path traversal', () => {
    expect(() => resolveVersionsPath('/storage', '..', ['etc'])).toThrow(
      'Path traversal detected'
    )
  })
})

describe('resolvePresetPath', () => {
  it('should resolve preset path', () => {
    const result = resolvePresetPath('/storage', 'vue-fullstack')
    expect(result).toContain('presets/vue-fullstack/preset.json')
  })

  it('should throw on path traversal', () => {
    expect(() => resolvePresetPath('/storage', '../../etc')).toThrow(
      'Path traversal detected'
    )
  })
})

describe('resolveSchemaPath', () => {
  it('should resolve schema path', () => {
    const result = resolveSchemaPath('/app/schema', 'registry-item.json')
    expect(result).toContain('schema/registry-item.json')
  })

  it('should throw on path traversal', () => {
    expect(() => resolveSchemaPath('/app/schema', '../../etc/passwd')).toThrow(
      'Path traversal detected'
    )
  })
})
