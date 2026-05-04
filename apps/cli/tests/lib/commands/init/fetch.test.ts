import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../../../src/lib/registry/client.js', () => ({
  registry: { fetchItem: vi.fn(), fetchPreset: vi.fn() }
}))

import { fetchTemplate } from '../../../../src/lib/commands/init/fetch.js'
import { registry } from '../../../../src/lib/registry/client.js'
import { createItem, createMockLogger } from '../../../helpers/mocks.js'

const fetchItemMock = registry.fetchItem as unknown as ReturnType<typeof vi.fn>
const fetchPresetMock = registry.fetchPreset as unknown as ReturnType<
  typeof vi.fn
>

beforeEach(() => {
  fetchItemMock.mockReset()
  fetchPresetMock.mockReset()
})
afterEach(() => vi.restoreAllMocks())

describe('init/fetch', () => {
  it('fetches all registries listed in a preset', async () => {
    fetchPresetMock.mockResolvedValue({
      name: 'x',
      version: '1',
      registries: ['@rack/a', '@rack/b']
    })
    fetchItemMock.mockImplementation(async (id: string) =>
      createItem({ identifier: id })
    )

    const items = await fetchTemplate('@presets/x', {
      language: 'ts',
      logger: createMockLogger()
    })
    expect(items.map((i) => i.identifier)).toEqual(['@rack/a', '@rack/b'])
  })

  it('fetches a single registry when template is not a preset', async () => {
    fetchItemMock.mockResolvedValue(createItem({ identifier: '@rack/vue' }))
    const items = await fetchTemplate('@rack/vue', {
      logger: createMockLogger()
    })
    expect(items.length).toBe(1)
    expect(fetchPresetMock).not.toHaveBeenCalled()
  })

  it('forwards language option to registry.fetchItem', async () => {
    fetchItemMock.mockResolvedValue(createItem({ identifier: '@rack/vue' }))
    await fetchTemplate('@rack/vue', {
      language: 'js',
      logger: createMockLogger()
    })
    expect(fetchItemMock).toHaveBeenCalledWith('@rack/vue', { language: 'js' })
  })
})
