import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../../src/lib/registry/client.js', () => ({
  registry: { fetchItem: vi.fn() }
}))

import { resolveRegistryDependencies } from '../../../src/lib/pipeline/resolve-dependencies.js'
import { registry } from '../../../src/lib/registry/client.js'
import { createItem, createMockLogger } from '../../helpers/mocks.js'

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
      registryDependencies: ['utils@1.0.0']
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
})
