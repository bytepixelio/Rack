import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../../../src/lib/registry/client.js', () => ({
  registry: { fetchItem: vi.fn(), fetchItems: vi.fn() }
}))
vi.mock('../../../../src/lib/pipeline/apply.js', () => ({
  applyFiles: vi.fn()
}))
vi.mock('../../../../src/lib/pkg.js', () => ({
  pkg: { update: vi.fn() }
}))

import { addRegistry } from '../../../../src/lib/commands/add/pipeline.js'
import { registry } from '../../../../src/lib/registry/client.js'
import { applyFiles } from '../../../../src/lib/pipeline/apply.js'
import { pkg } from '../../../../src/lib/pkg.js'
import { createItem, createMockLogger } from '../../../helpers/mocks.js'
import { AppError, ConflictError } from '../../../../src/lib/utils/errors.js'

const fetchItemMock = registry.fetchItem as unknown as ReturnType<typeof vi.fn>
const fetchItemsMock = registry.fetchItems as unknown as ReturnType<
  typeof vi.fn
>
const applyMock = applyFiles as unknown as ReturnType<typeof vi.fn>
const pkgUpdateMock = pkg.update as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchItemMock.mockReset()
  fetchItemsMock.mockReset()
  applyMock.mockReset()
  pkgUpdateMock.mockReset()
  fetchItemsMock.mockResolvedValue([])
  applyMock.mockResolvedValue([])
  pkgUpdateMock.mockResolvedValue({})
})
afterEach(() => vi.restoreAllMocks())

describe('add/pipeline addRegistry', () => {
  it('throws INVALID_USAGE AppError for preset identifiers', async () => {
    const err = await addRegistry(
      { identifier: '@presets/tutorial', targetDir: '/t' },
      createMockLogger()
    ).catch((e) => e)
    expect(err).toBeInstanceOf(AppError)
    expect(err.code).toBe('INVALID_USAGE')
  })

  it('fetches the root, sorts, applies files, and updates package.json', async () => {
    const root = createItem({
      identifier: '@rack/vue',
      priority: 2,
      dependencies: { vue: '^3.0.0' },
      scripts: { dev: 'vite' }
    })
    fetchItemMock.mockResolvedValue(root)

    const result = await addRegistry(
      { identifier: '@rack/vue', targetDir: '/t' },
      createMockLogger()
    )

    expect(result.appliedRegistries).toEqual(['@rack/vue'])
    expect(result.initialRegistries).toEqual(['@rack/vue'])
    expect(result.scripts).toEqual({ dev: 'vite' })
    expect(result.dependencies).toEqual({ vue: '^3.0.0' })
    expect(pkgUpdateMock).toHaveBeenCalledWith('/t', expect.any(Object))
  })

  it('calls fetchItems for installedRegistries and validates conflicts', async () => {
    fetchItemMock.mockResolvedValue(
      createItem({ identifier: '@rack/a', conflicts: ['@rack/b'] })
    )
    fetchItemsMock.mockResolvedValue([createItem({ identifier: '@rack/b' })])

    await expect(
      addRegistry(
        {
          identifier: '@rack/a',
          targetDir: '/t',
          installedRegistries: ['@rack/b']
        },
        createMockLogger()
      )
    ).rejects.toBeInstanceOf(ConflictError)
  })

  it('merges dependencies, devDependencies, and scripts from all items', async () => {
    fetchItemMock.mockResolvedValue(
      createItem({
        identifier: '@rack/vue',
        dependencies: { vue: '^3.0.0' },
        devDependencies: { vitest: '^1.0.0' },
        scripts: { test: 'vitest' }
      })
    )
    await addRegistry(
      { identifier: '@rack/vue', targetDir: '/t' },
      createMockLogger()
    )
    expect(pkgUpdateMock.mock.calls[0][1]).toEqual({
      dependencies: { vue: '^3.0.0' },
      devDependencies: { vitest: '^1.0.0' },
      scripts: { test: 'vitest' }
    })
  })

  it('defaults installedRegistries to an empty array', async () => {
    fetchItemMock.mockResolvedValue(createItem({ identifier: '@rack/a' }))
    await addRegistry(
      { identifier: '@rack/a', targetDir: '/t' },
      createMockLogger()
    )
    expect(fetchItemsMock).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ logger: expect.anything() })
    )
  })
})
