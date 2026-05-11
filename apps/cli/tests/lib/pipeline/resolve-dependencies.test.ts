import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest'

vi.mock('../../../src/lib/registry/client.js', () => ({
  registry: { fetchItem: vi.fn() }
}))

import { registry } from '../../../src/lib/registry/client.js'
import { createItem, createMockLogger } from '../../helpers/mocks.js'
import { resolveRegistryDependencies } from '../../../src/lib/pipeline/resolve-dependencies.js'

const fetchItemMock = registry.fetchItem as unknown as ReturnType<typeof vi.fn>

beforeEach(() => fetchItemMock.mockReset())
afterEach(() => vi.restoreAllMocks())

describe('pipeline/resolve-dependencies', () => {
  it('returns input unchanged when nothing has dependencies', async () => {
    const items = [createItem({ identifier: 'a' })]
    const got = await resolveRegistryDependencies(
      items,
      'ts',
      createMockLogger()
    )
    expect(got.map((i) => i.identifier)).toEqual(['a'])
    expect(fetchItemMock).not.toHaveBeenCalled()
  })

  it('recursively fetches transitive dependencies (BFS via Map iterator)', async () => {
    const a = createItem({ identifier: 'a', registryDependencies: ['b'] })
    const b = createItem({ identifier: 'b', registryDependencies: ['c'] })
    const c = createItem({ identifier: 'c' })
    fetchItemMock.mockImplementation(async (id: string) => (id === 'b' ? b : c))

    const got = await resolveRegistryDependencies([a], 'ts', createMockLogger())
    expect(got.map((i) => i.identifier)).toEqual(['a', 'b', 'c'])
  })

  it('de-duplicates already-resolved dependencies', async () => {
    const a = createItem({ identifier: 'a', registryDependencies: ['b'] })
    const b = createItem({ identifier: 'b' })
    fetchItemMock.mockResolvedValue(b)

    await resolveRegistryDependencies([a, b], 'ts', createMockLogger())
    expect(fetchItemMock).not.toHaveBeenCalled()
  })

  it('deduplicates dependencies with different identifier forms', async () => {
    const a = createItem({
      identifier: '@rack/a',
      registryDependencies: ['@rack/utils']
    })
    const b = createItem({
      identifier: '@rack/b',
      registryDependencies: ['utils']
    })
    const utils = createItem({ identifier: '@rack/utils' })
    fetchItemMock.mockResolvedValue(utils)

    const got = await resolveRegistryDependencies(
      [a, b],
      'ts',
      createMockLogger()
    )
    expect(fetchItemMock).toHaveBeenCalledTimes(1)
    expect(got.map((i) => i.identifier)).toEqual([
      '@rack/a',
      '@rack/b',
      '@rack/utils'
    ])
  })

  it('forwards the language option to registry.fetchItem', async () => {
    const a = createItem({ identifier: 'a', registryDependencies: ['b'] })
    const b = createItem({ identifier: 'b' })
    fetchItemMock.mockResolvedValue(b)

    await resolveRegistryDependencies([a], 'js', createMockLogger())
    expect(fetchItemMock).toHaveBeenCalledWith('b', { language: 'js' })
  })

  it('skips transitive deps that are already installed', async () => {
    const a = createItem({
      identifier: '@rack/a',
      registryDependencies: ['@rack/b']
    })
    fetchItemMock.mockResolvedValue(createItem({ identifier: '@rack/b' }))

    const got = await resolveRegistryDependencies(
      [a],
      'ts',
      createMockLogger(),
      ['@rack/b']
    )

    expect(fetchItemMock).not.toHaveBeenCalled()
    expect(got.map((i) => i.identifier)).toEqual(['@rack/a'])
  })

  it('matches installed identifiers by canonical form', async () => {
    const a = createItem({
      identifier: '@rack/a',
      registryDependencies: ['@rack/utils']
    })
    fetchItemMock.mockResolvedValue(createItem({ identifier: '@rack/utils' }))

    // Installed list carries version + language suffixes and a different
    // case; canonical form still collapses to `@rack/utils`.
    const got = await resolveRegistryDependencies(
      [a],
      'ts',
      createMockLogger(),
      ['@RACK/utils@1.0.0:ts']
    )

    expect(fetchItemMock).not.toHaveBeenCalled()
    expect(got.map((i) => i.identifier)).toEqual(['@rack/a'])
  })

  it('keeps roots that happen to be in installed (caller controls roots)', async () => {
    // A root passed in `items` is preserved even if its canonical id is
    // also listed in `installed` — `installed` only suppresses transitive
    // appearance via registryDependencies, not roots the caller chose.
    const a = createItem({ identifier: '@rack/a' })

    const got = await resolveRegistryDependencies(
      [a],
      'ts',
      createMockLogger(),
      ['@rack/a']
    )

    expect(fetchItemMock).not.toHaveBeenCalled()
    expect(got.map((i) => i.identifier)).toEqual(['@rack/a'])
  })
})
