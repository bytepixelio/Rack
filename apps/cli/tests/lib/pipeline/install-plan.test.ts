import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest'

vi.mock('../../../src/lib/registry/client.js', () => ({
  registry: { fetchItem: vi.fn(), fetchItems: vi.fn() }
}))

import { registry } from '../../../src/lib/registry/client.js'
import { createItem, createMockLogger } from '../../helpers/mocks.js'
import { buildInstallPlan } from '../../../src/lib/pipeline/install-plan.js'
import {
  ConflictError,
  DuplicateRegistryError
} from '../../../src/lib/utils/errors.js'

const fetchItemMock = registry.fetchItem as unknown as ReturnType<typeof vi.fn>
const fetchItemsMock = registry.fetchItems as unknown as ReturnType<
  typeof vi.fn
>

beforeEach(() => {
  fetchItemMock.mockReset()
  fetchItemsMock.mockReset()
  fetchItemsMock.mockResolvedValue([])
})
afterEach(() => vi.restoreAllMocks())

describe('pipeline/install-plan buildInstallPlan', () => {
  it('returns a plan with only the root when no deps and nothing installed', async () => {
    const root = createItem({ identifier: '@rack/a' })

    const plan = await buildInstallPlan({
      requested: [root],
      logger: createMockLogger()
    })

    expect(plan.requested).toEqual([root])
    expect(plan.resolvedDependencies).toEqual([])
    expect(plan.alreadyInstalled).toEqual([])
    expect(plan.toApply).toEqual([root])
    expect(plan.toRecord).toEqual(['@rack/a'])
  })

  it('separates transitive dependencies from requested roots', async () => {
    // B is requested; B depends on A. A becomes a resolvedDependency.
    const a = createItem({ identifier: '@rack/a' })
    const b = createItem({
      identifier: '@rack/b',
      registryDependencies: ['@rack/a']
    })
    fetchItemMock.mockResolvedValue(a)

    const plan = await buildInstallPlan({
      requested: [b],
      logger: createMockLogger()
    })

    expect(plan.requested.map((i) => i.identifier)).toEqual(['@rack/b'])
    expect(plan.resolvedDependencies.map((i) => i.identifier)).toEqual([
      '@rack/a'
    ])
    expect(plan.toApply.map((i) => i.identifier)).toEqual([
      '@rack/a',
      '@rack/b'
    ])
    expect(plan.toRecord).toEqual(['@rack/a', '@rack/b'])
  })

  it('exposes already-installed items and skips them from toApply', async () => {
    // B (new) declares A (installed) as a dep. A must not re-apply, but
    // must still surface in alreadyInstalled so the caller can reason
    // about reciprocal conflicts.
    const installedA = createItem({ identifier: '@rack/a' })
    const b = createItem({
      identifier: '@rack/b',
      registryDependencies: ['@rack/a']
    })
    fetchItemsMock.mockResolvedValue([installedA])

    const plan = await buildInstallPlan({
      requested: [b],
      installedRegistries: ['@rack/a'],
      logger: createMockLogger()
    })

    expect(plan.alreadyInstalled).toEqual([installedA])
    expect(plan.toApply.map((i) => i.identifier)).toEqual(['@rack/b'])
    expect(plan.toRecord).toEqual(['@rack/b'])
    // A is fetched via fetchItems (for conflict checking), not fetchItem.
    expect(fetchItemMock).not.toHaveBeenCalled()
  })

  it('rejects with ConflictError when requested conflicts with installed', async () => {
    fetchItemsMock.mockResolvedValue([
      createItem({ identifier: '@rack/installed', conflicts: ['@rack/new'] })
    ])

    await expect(
      buildInstallPlan({
        requested: [createItem({ identifier: '@rack/new' })],
        installedRegistries: ['@rack/installed'],
        logger: createMockLogger()
      })
    ).rejects.toBeInstanceOf(ConflictError)
  })

  it('warns when an installed registry could not be fetched (singular)', async () => {
    const logger = createMockLogger()
    fetchItemsMock.mockResolvedValue([
      createItem({ identifier: '@rack/installed' })
    ])

    await buildInstallPlan({
      requested: [createItem({ identifier: '@rack/new' })],
      installedRegistries: ['@rack/installed', '@rack/missing'],
      logger
    })

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/Conflict check is degraded.*@rack\/missing/)
    )
  })

  it('pluralizes the degraded warning when multiple fetches fail', async () => {
    const logger = createMockLogger()
    fetchItemsMock.mockResolvedValue([
      createItem({ identifier: '@rack/installed' })
    ])

    await buildInstallPlan({
      requested: [createItem({ identifier: '@rack/new' })],
      installedRegistries: [
        '@rack/installed',
        '@rack/missing-1',
        '@rack/missing-2'
      ],
      logger
    })

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(
        /could not fetch installed registries .*these registries/
      )
    )
  })

  it('does not warn when fetched count differs but every canonical id is present', async () => {
    // Two installed entries collapse to the same canonical key — one
    // fetched item satisfies both, so the missing-list is empty.
    const logger = createMockLogger()
    fetchItemsMock.mockResolvedValue([createItem({ identifier: '@rack/b' })])

    await buildInstallPlan({
      requested: [createItem({ identifier: '@rack/a' })],
      installedRegistries: ['@rack/b', '@RACK/b'],
      logger
    })

    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('Conflict check is degraded')
    )
  })

  it('does not warn when every installed registry fetched successfully', async () => {
    const logger = createMockLogger()
    fetchItemsMock.mockResolvedValue([createItem({ identifier: '@rack/b' })])

    await buildInstallPlan({
      requested: [createItem({ identifier: '@rack/a' })],
      installedRegistries: ['@rack/b'],
      logger
    })

    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('Conflict check is degraded')
    )
  })

  it('rejects roots that pin different versions of the same registry', async () => {
    // Preset misconfig: same canonical id at two versions. Silently picking
    // one (current map-based dedupe) would scaffold a different version than
    // the preset advertised.
    await expect(
      buildInstallPlan({
        requested: [
          createItem({ identifier: '@rack/runtimes/node@1.0.0' }),
          createItem({ identifier: '@rack/runtimes/node@2.0.0' })
        ],
        logger: createMockLogger()
      })
    ).rejects.toBeInstanceOf(DuplicateRegistryError)
  })

  it('rejects roots that combine different language variants of the same registry', async () => {
    await expect(
      buildInstallPlan({
        requested: [
          createItem({ identifier: '@rack/frameworks/vue:ts' }),
          createItem({ identifier: '@rack/frameworks/vue:js' })
        ],
        logger: createMockLogger()
      })
    ).rejects.toBeInstanceOf(DuplicateRegistryError)
  })

  it('rejects roots that repeat the same identifier verbatim', async () => {
    // Even with identical suffixes the silent-dedupe hides the bug, so the
    // duplicate is surfaced regardless of whether the suffixes differ.
    const err = await buildInstallPlan({
      requested: [
        createItem({ identifier: '@rack/a' }),
        createItem({ identifier: '@rack/a' })
      ],
      logger: createMockLogger()
    }).then(
      () => null,
      (e: unknown) => e
    )
    expect(err).toBeInstanceOf(DuplicateRegistryError)
    expect((err as DuplicateRegistryError).canonical).toBe('@rack/a')
    expect((err as DuplicateRegistryError).identifiers).toEqual([
      '@rack/a',
      '@rack/a'
    ])
  })

  it('rejects roots whose identifiers normalize to the same canonical key', async () => {
    // Different surface forms (`vue` default-namespaced vs `@rack/vue`,
    // mixed casing) collapse to the same canonical key and would still be
    // silently deduped without this guard.
    await expect(
      buildInstallPlan({
        requested: [
          createItem({ identifier: 'vue' }),
          createItem({ identifier: '@RACK/Vue' })
        ],
        logger: createMockLogger()
      })
    ).rejects.toBeInstanceOf(DuplicateRegistryError)
  })

  it('forwards the language override to fetchItems for installed items', async () => {
    fetchItemsMock.mockResolvedValue([])

    await buildInstallPlan({
      requested: [createItem({ identifier: '@rack/a' })],
      installedRegistries: ['@rack/b'],
      language: 'js',
      logger: createMockLogger()
    })

    expect(fetchItemsMock).toHaveBeenCalledWith(
      ['@rack/b'],
      expect.objectContaining({ language: 'js' })
    )
  })
})
