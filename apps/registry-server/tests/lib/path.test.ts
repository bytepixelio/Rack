import { it, expect, describe } from 'vitest'
import {
  resolveFilePath,
  resolvePresetPath,
  resolveSchemaPath,
  resolveRegistryPath,
  resolveVersionsPath
} from '../../src/lib/path.js'

// `parseRegistryUrl` itself is exhaustively covered in
// `packages/registry-core/tests/parser.test.ts`. Server-side path tests
// only exercise the absolute-path resolvers + traversal guard.

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

  it('should throw on sibling-prefix traversal', () => {
    expect(() =>
      resolveRegistryPath(
        '/tmp/rack',
        '@rack',
        ['..', '..', '..', 'rack-secrets'],
        '1.0.0'
      )
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

  it('should throw on sibling-prefix traversal via filePath', () => {
    expect(() =>
      resolveFilePath(
        '/tmp/rack',
        '@rack',
        ['node'],
        '1.0.0',
        '../../../../rack-secrets/config.json'
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
