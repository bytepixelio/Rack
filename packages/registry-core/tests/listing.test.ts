import { it, expect, describe } from 'vitest'
import { listRegistries } from '../src/listing.js'

import type { RegistryStore } from '../src/listing.js'

/** In-memory `RegistryStore` for tests — yields a fixed set of keys. */
function stubStore(keys: string[]): RegistryStore {
  return {
    async *walk(prefix: string) {
      for (const key of keys) {
        if (key.startsWith(prefix)) yield key
      }
    }
  }
}

describe('listRegistries', () => {
  it('extracts paths from versions.json keys', async () => {
    const store = stubStore([
      '@rack/node/versions.json',
      '@rack/node/1.0.0/registry.json',
      '@rack/vue/versions.json',
      '@rack/vue/2.0.0/registry.json'
    ])

    expect(await listRegistries(store, '@rack')).toEqual(['node', 'vue'])
  })

  it('handles multi-segment registries', async () => {
    const store = stubStore([
      '@rack/quality/husky/versions.json',
      '@rack/quality/husky/1.0.0/registry.json',
      '@rack/build/typescript/versions.json',
      '@rack/runtimes/node/versions.json'
    ])

    expect(await listRegistries(store, '@rack')).toEqual([
      'build/typescript',
      'quality/husky',
      'runtimes/node'
    ])
  })

  it('mixes single and multi-segment registries', async () => {
    const store = stubStore([
      '@rack/node/versions.json',
      '@rack/quality/husky/versions.json',
      '@rack/quality/eslint/versions.json'
    ])

    expect(await listRegistries(store, '@rack')).toEqual([
      'node',
      'quality/eslint',
      'quality/husky'
    ])
  })

  it('de-duplicates if a key appears more than once', async () => {
    const store = stubStore([
      '@rack/node/versions.json',
      '@rack/node/versions.json'
    ])

    expect(await listRegistries(store, '@rack')).toEqual(['node'])
  })

  it('ignores non-versions.json keys', async () => {
    const store = stubStore([
      '@rack/node/1.0.0/registry.json',
      '@rack/node/1.0.0/templates/.gitignore',
      '@rack/quality/husky/versions.json'
    ])

    expect(await listRegistries(store, '@rack')).toEqual(['quality/husky'])
  })

  it('skips a stray top-level versions.json directly under namespace', async () => {
    const store = stubStore(['@rack/versions.json'])

    expect(await listRegistries(store, '@rack')).toEqual([])
  })

  it('returns an empty list when the store yields nothing', async () => {
    expect(await listRegistries(stubStore([]), '@rack')).toEqual([])
  })

  it('only walks under the requested namespace', async () => {
    const store = stubStore([
      '@rack/node/versions.json',
      '@company/node/versions.json'
    ])

    expect(await listRegistries(store, '@rack')).toEqual(['node'])
  })
})
