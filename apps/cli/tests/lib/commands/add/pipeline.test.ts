import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest'

vi.mock('../../../../src/lib/registry/client.js', () => ({
  registry: { fetchItem: vi.fn(), fetchItems: vi.fn() }
}))
vi.mock('../../../../src/lib/pipeline/apply.js', () => ({
  applyFiles: vi.fn()
}))
vi.mock('../../../../src/lib/pkg.js', () => ({
  pkg: { update: vi.fn() }
}))

import { pkg } from '../../../../src/lib/pkg.js'
import { registry } from '../../../../src/lib/registry/client.js'
import { applyFiles } from '../../../../src/lib/pipeline/apply.js'
import { createItem, createMockLogger } from '../../../helpers/mocks.js'
import { addRegistry } from '../../../../src/lib/commands/add/pipeline.js'
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

  it('warns that conflict check is degraded when an installed fetch fails', async () => {
    const logger = createMockLogger()
    fetchItemMock.mockResolvedValue(createItem({ identifier: '@rack/a' }))
    // installedRegistries asks for two; fetchItems returns one — the
    // second silently failed (per fetchItems contract).
    fetchItemsMock.mockResolvedValue([createItem({ identifier: '@rack/b' })])

    await addRegistry(
      {
        identifier: '@rack/a',
        targetDir: '/t',
        installedRegistries: ['@rack/b', '@rack/missing']
      },
      logger
    )

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/Conflict check is degraded.*@rack\/missing/)
    )
  })

  it('does not warn when every installed registry fetched successfully', async () => {
    const logger = createMockLogger()
    fetchItemMock.mockResolvedValue(createItem({ identifier: '@rack/a' }))
    fetchItemsMock.mockResolvedValue([createItem({ identifier: '@rack/b' })])

    await addRegistry(
      {
        identifier: '@rack/a',
        targetDir: '/t',
        installedRegistries: ['@rack/b']
      },
      logger
    )

    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('Conflict check is degraded')
    )
  })

  it('does not warn when fetched count differs but every requested canonical id is present', async () => {
    const logger = createMockLogger()
    fetchItemMock.mockResolvedValue(createItem({ identifier: '@rack/a' }))
    // Two requested entries collapse to the same canonical key, so the
    // single fetched item satisfies both — `missing` ends up empty even
    // though `fetched.length !== requested.length`.
    fetchItemsMock.mockResolvedValue([createItem({ identifier: '@rack/b' })])

    await addRegistry(
      {
        identifier: '@rack/a',
        targetDir: '/t',
        installedRegistries: ['@rack/b', '@RACK/b']
      },
      logger
    )

    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('Conflict check is degraded')
    )
  })

  it('does not re-apply transitive deps that are already installed', async () => {
    // B (new) declares A (already installed) as a registry dependency.
    // A must not appear in applyFiles or pkg.update, but conflict checking
    // still sees A via fetchItems(installedRegistries).
    const b = createItem({
      identifier: '@rack/b',
      dependencies: { b: '^1.0.0' },
      registryDependencies: ['@rack/a']
    })
    fetchItemMock.mockResolvedValue(b)
    fetchItemsMock.mockResolvedValue([
      createItem({
        identifier: '@rack/a',
        dependencies: { a: '^1.0.0' }
      })
    ])

    const result = await addRegistry(
      {
        identifier: '@rack/b',
        targetDir: '/t',
        installedRegistries: ['@rack/a']
      },
      createMockLogger()
    )

    expect(result.appliedRegistries).toEqual(['@rack/b'])
    expect(result.dependencies).toEqual({ b: '^1.0.0' })
    expect(applyMock).toHaveBeenCalledWith(
      [expect.objectContaining({ identifier: '@rack/b' })],
      '/t',
      undefined,
      expect.anything()
    )
    // A is fetched once via fetchItems for conflict checking, but not via
    // fetchItem during dependency resolution.
    expect(fetchItemMock).toHaveBeenCalledTimes(1)
    expect(fetchItemMock).toHaveBeenCalledWith('@rack/b', expect.anything())
  })

  it('still enforces reciprocal conflicts from installed deps that were skipped', async () => {
    // A is installed, B depends on A, and A reciprocally conflicts with B.
    // Even though A is skipped in dependency resolution, fetchItems still
    // pulls A so conflict detection catches it.
    fetchItemMock.mockResolvedValue(
      createItem({
        identifier: '@rack/b',
        registryDependencies: ['@rack/a']
      })
    )
    fetchItemsMock.mockResolvedValue([
      createItem({ identifier: '@rack/a', conflicts: ['@rack/b'] })
    ])

    await expect(
      addRegistry(
        {
          identifier: '@rack/b',
          targetDir: '/t',
          installedRegistries: ['@rack/a']
        },
        createMockLogger()
      )
    ).rejects.toBeInstanceOf(ConflictError)
  })

  it('pluralizes the degraded warning when multiple installed fetches fail', async () => {
    const logger = createMockLogger()
    fetchItemMock.mockResolvedValue(createItem({ identifier: '@rack/a' }))
    fetchItemsMock.mockResolvedValue([createItem({ identifier: '@rack/b' })])

    await addRegistry(
      {
        identifier: '@rack/a',
        targetDir: '/t',
        installedRegistries: ['@rack/b', '@rack/missing-1', '@rack/missing-2']
      },
      logger
    )

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(
        /could not fetch installed registries .*these registries/
      )
    )
  })
})
