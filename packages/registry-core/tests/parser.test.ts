import { it, expect, describe } from 'vitest'
import { parseRegistryUrl } from '../src/parser.js'

describe('parseRegistryUrl', () => {
  // ─── versions ──────────────────────────────────────────────────────

  it('parses /@ns/name/versions (single segment)', () => {
    expect(parseRegistryUrl('/@rack/node/versions')).toEqual({
      type: 'versions',
      locator: { namespace: '@rack', segments: ['node'] }
    })
  })

  it('parses /@ns/cat/name/versions (multi segment)', () => {
    expect(parseRegistryUrl('/@rack/quality/husky/versions')).toEqual({
      type: 'versions',
      locator: { namespace: '@rack', segments: ['quality', 'husky'] }
    })
  })

  // ─── latest ────────────────────────────────────────────────────────

  it('parses /@ns/name (single segment latest)', () => {
    expect(parseRegistryUrl('/@rack/node')).toEqual({
      type: 'latest',
      locator: { namespace: '@rack', segments: ['node'] }
    })
  })

  it('parses /@ns/cat/name (multi segment latest)', () => {
    expect(parseRegistryUrl('/@rack/runtimes/node')).toEqual({
      type: 'latest',
      locator: { namespace: '@rack', segments: ['runtimes', 'node'] }
    })
  })

  // ─── versioned ─────────────────────────────────────────────────────

  it('parses /@ns/name/<semver> (single segment versioned)', () => {
    expect(parseRegistryUrl('/@rack/node/1.0.0')).toEqual({
      type: 'versioned',
      locator: { namespace: '@rack', segments: ['node'], version: '1.0.0' }
    })
  })

  it('parses /@ns/cat/name/<semver> (multi segment versioned)', () => {
    expect(parseRegistryUrl('/@rack/quality/husky/1.0.1')).toEqual({
      type: 'versioned',
      locator: {
        namespace: '@rack',
        segments: ['quality', 'husky'],
        version: '1.0.1'
      }
    })
  })

  it('parses prerelease and build SemVer', () => {
    expect(parseRegistryUrl('/@rack/node/2.3.1-beta')).toEqual({
      type: 'versioned',
      locator: { namespace: '@rack', segments: ['node'], version: '2.3.1-beta' }
    })
  })

  // ─── file ──────────────────────────────────────────────────────────

  it('parses /@ns/name/<semver>/files/<filePath>', () => {
    expect(parseRegistryUrl('/@rack/node/1.0.0/files/src/index.ts')).toEqual({
      type: 'file',
      locator: {
        namespace: '@rack',
        segments: ['node'],
        version: '1.0.0',
        filePath: 'src/index.ts'
      }
    })
  })

  it('parses multi-segment file with nested filePath', () => {
    expect(
      parseRegistryUrl(
        '/@rack/quality/husky/1.0.0/files/templates/.husky/commit-msg'
      )
    ).toEqual({
      type: 'file',
      locator: {
        namespace: '@rack',
        segments: ['quality', 'husky'],
        version: '1.0.0',
        filePath: 'templates/.husky/commit-msg'
      }
    })
  })

  // ─── invalid ───────────────────────────────────────────────────────

  it('returns null when missing namespace', () => {
    expect(parseRegistryUrl('/node')).toBeNull()
  })

  it('returns null when namespace lacks @', () => {
    expect(parseRegistryUrl('/rack/node')).toBeNull()
  })

  it('returns null when only namespace is given', () => {
    expect(parseRegistryUrl('/@rack')).toBeNull()
  })

  it('returns null when path is empty', () => {
    expect(parseRegistryUrl('/')).toBeNull()
  })

  it('returns null for files/ without trailing path', () => {
    expect(parseRegistryUrl('/@rack/node/1.0.0/files')).toBeNull()
  })

  it('returns null for unknown suffix after version', () => {
    expect(parseRegistryUrl('/@rack/node/1.0.0/something-else')).toBeNull()
  })

  it('collapses leading double slashes harmlessly', () => {
    // Callers pre-normalize, but the parser must not blow up either way.
    expect(parseRegistryUrl('//@rack//node//1.0.0')).toEqual({
      type: 'versioned',
      locator: { namespace: '@rack', segments: ['node'], version: '1.0.0' }
    })
  })

  // ─── field-level validation ───────────────────────────────────────

  it('returns null for uppercase namespace', () => {
    expect(parseRegistryUrl('/@Rack/node/1.0.0')).toBeNull()
  })

  it('returns null for namespace containing dot', () => {
    expect(parseRegistryUrl('/@rack.io/node/1.0.0')).toBeNull()
  })

  it('returns null for namespace without alphanumeric body', () => {
    expect(parseRegistryUrl('/@/node/1.0.0')).toBeNull()
  })

  it('returns null for traversal-style segment', () => {
    expect(parseRegistryUrl('/@rack/../etc/passwd')).toBeNull()
  })

  it('returns null for uppercase segment', () => {
    expect(parseRegistryUrl('/@rack/Node/1.0.0')).toBeNull()
  })

  it('returns null for segment containing dot', () => {
    expect(parseRegistryUrl('/@rack/node.js/1.0.0')).toBeNull()
  })

  it('returns null for segment containing underscore', () => {
    expect(parseRegistryUrl('/@rack/node_modules/1.0.0')).toBeNull()
  })

  it('returns null for trailing-dash segment', () => {
    expect(parseRegistryUrl('/@rack/node-/1.0.0')).toBeNull()
  })

  it('returns null for traversal segment under /versions', () => {
    expect(parseRegistryUrl('/@rack/../versions')).toBeNull()
  })

  it('returns null for traversal segment in file path', () => {
    expect(parseRegistryUrl('/@rack/node/1.0.0/files/../leak')).toBeNull()
  })

  it('returns null for backslash in file path', () => {
    expect(parseRegistryUrl('/@rack/node/1.0.0/files/a\\b')).toBeNull()
  })

  it('returns null for absolute-style file path', () => {
    // collapse to /@rack/node/1.0.0/files/leak — leading slash stripped
    // by split-filter, but the file path itself must still survive
    // validateFilePath checks.
    expect(parseRegistryUrl('/@rack/node/1.0.0/files/%2e%2e/leak')).toBeNull()
  })

  it('accepts kebab-case multi-dash segments', () => {
    expect(parseRegistryUrl('/@rack/build-tools/vite-plugin/1.0.0')).toEqual({
      type: 'versioned',
      locator: {
        namespace: '@rack',
        segments: ['build-tools', 'vite-plugin'],
        version: '1.0.0'
      }
    })
  })

  it('accepts namespace with mid-string underscore and dash', () => {
    expect(parseRegistryUrl('/@my_org-x/node/1.0.0')).toEqual({
      type: 'versioned',
      locator: {
        namespace: '@my_org-x',
        segments: ['node'],
        version: '1.0.0'
      }
    })
  })
})
