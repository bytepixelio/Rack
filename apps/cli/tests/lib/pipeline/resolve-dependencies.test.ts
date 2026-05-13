import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest'

vi.mock('../../../src/lib/registry/client.js', () => ({
  registry: { fetchItem: vi.fn() }
}))

import { AppError } from '../../../src/lib/utils/errors.js'
import { registry } from '../../../src/lib/registry/client.js'
import { createItem, createMockLogger } from '../../helpers/mocks.js'
import { resolveRegistryDependencies } from '../../../src/lib/pipeline/resolve-dependencies.js'

const fetchItemMock = registry.fetchItem as unknown as ReturnType<typeof vi.fn>

beforeEach(() => fetchItemMock.mockReset())
afterEach(() => vi.restoreAllMocks())

describe('pipeline/resolve-dependencies', () => {
  it('returns input unchanged when nothing has dependencies', async () => {
    const items = [createItem({ identifier: 'a' })]
    const got = await resolveRegistryDependencies(items, createMockLogger())
    expect(got.map((i) => i.identifier)).toEqual(['a'])
    expect(fetchItemMock).not.toHaveBeenCalled()
  })

  it('recursively fetches transitive dependencies (BFS via Map iterator)', async () => {
    const a = createItem({ identifier: 'a', registryDependencies: ['b'] })
    const b = createItem({ identifier: 'b', registryDependencies: ['c'] })
    const c = createItem({ identifier: 'c' })
    fetchItemMock.mockImplementation(async (id: string) => (id === 'b' ? b : c))

    const got = await resolveRegistryDependencies([a], createMockLogger())
    expect(got.map((i) => i.identifier)).toEqual(['a', 'b', 'c'])
  })

  it('de-duplicates already-resolved dependencies', async () => {
    const a = createItem({ identifier: 'a', registryDependencies: ['b'] })
    const b = createItem({ identifier: 'b' })
    fetchItemMock.mockResolvedValue(b)

    await resolveRegistryDependencies([a, b], createMockLogger())
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

    const got = await resolveRegistryDependencies([a, b], createMockLogger())
    expect(fetchItemMock).toHaveBeenCalledTimes(1)
    expect(got.map((i) => i.identifier)).toEqual([
      '@rack/a',
      '@rack/b',
      '@rack/utils'
    ])
  })

  it("fetches each transitive dep with its parent's resolvedLanguage", async () => {
    // A JS root pulls JS deps even when the project default is TS — the
    // dep's `:language` is inherited from `current.resolvedLanguage`,
    // not from a single project-wide parameter.
    const a = createItem({
      identifier: 'a',
      resolvedLanguage: 'js',
      registryDependencies: ['b']
    })
    const b = createItem({ identifier: 'b', resolvedLanguage: 'js' })
    fetchItemMock.mockResolvedValue(b)

    await resolveRegistryDependencies([a], createMockLogger())
    expect(fetchItemMock).toHaveBeenCalledWith('b', { language: 'js' })
  })

  it('propagates language across multiple hops', async () => {
    // Branching language: a (js) → b inherits js → c inherits js.
    const a = createItem({
      identifier: 'a',
      resolvedLanguage: 'js',
      registryDependencies: ['b']
    })
    const b = createItem({
      identifier: 'b',
      resolvedLanguage: 'js',
      registryDependencies: ['c']
    })
    const c = createItem({ identifier: 'c', resolvedLanguage: 'js' })
    fetchItemMock.mockImplementation(async (id: string) => (id === 'b' ? b : c))

    await resolveRegistryDependencies([a], createMockLogger())
    expect(fetchItemMock).toHaveBeenNthCalledWith(1, 'b', { language: 'js' })
    expect(fetchItemMock).toHaveBeenNthCalledWith(2, 'c', { language: 'js' })
  })

  it('skips transitive deps that are already installed', async () => {
    const a = createItem({
      identifier: '@rack/a',
      registryDependencies: ['@rack/b']
    })
    fetchItemMock.mockResolvedValue(createItem({ identifier: '@rack/b' }))

    const got = await resolveRegistryDependencies([a], createMockLogger(), [
      '@rack/b'
    ])

    expect(fetchItemMock).not.toHaveBeenCalled()
    expect(got.map((i) => i.identifier)).toEqual(['@rack/a'])
  })

  it('matches installed identifiers by canonical form (case + language + version)', async () => {
    const a = createItem({
      identifier: '@rack/a',
      registryDependencies: ['@rack/utils']
    })
    fetchItemMock.mockResolvedValue(createItem({ identifier: '@rack/utils' }))

    // Different case, a language suffix, and a version on the installed
    // entry; canonical form collapses to `@rack/utils` regardless because
    // §6.10 keeps the manifest pin authoritative — registryDependencies
    // itself never carries those suffixes.
    const got = await resolveRegistryDependencies([a], createMockLogger(), [
      '@RACK/utils@1.2.3:ts'
    ])

    expect(fetchItemMock).not.toHaveBeenCalled()
    expect(got.map((i) => i.identifier)).toEqual(['@rack/a'])
  })

  it('keeps roots that happen to be in installed (caller controls roots)', async () => {
    // A root passed in `items` is preserved even if its canonical id is
    // also listed in `installed` — `installed` only suppresses transitive
    // appearance via registryDependencies, not roots the caller chose.
    const a = createItem({ identifier: '@rack/a' })

    const got = await resolveRegistryDependencies([a], createMockLogger(), [
      '@rack/a'
    ])

    expect(fetchItemMock).not.toHaveBeenCalled()
    expect(got.map((i) => i.identifier)).toEqual(['@rack/a'])
  })

  it('rejects pinned-version registryDependencies entries with VALIDATION_ERROR', async () => {
    // Schema forbids `@version` in registryDependencies. A self-hosted
    // static registry that bypasses Server-side validation could still
    // emit one; surface it cleanly instead of partially honoring it.
    const a = createItem({
      identifier: '@rack/a',
      registryDependencies: ['@rack/b@1.0.0']
    })

    await expect(
      resolveRegistryDependencies([a], createMockLogger())
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR'
    })
    await expect(
      resolveRegistryDependencies([a], createMockLogger())
    ).rejects.toBeInstanceOf(AppError)

    expect(fetchItemMock).not.toHaveBeenCalled()
  })

  it('rejects language-suffixed registryDependencies entries with VALIDATION_ERROR', async () => {
    const a = createItem({
      identifier: '@rack/a',
      registryDependencies: ['@rack/b:ts']
    })

    await expect(
      resolveRegistryDependencies([a], createMockLogger())
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  it('rejects pinned shorthand registryDependencies entries with VALIDATION_ERROR', async () => {
    // Shorthand (`runtimes/node@1.0.0`) carries no leading `@<ns>/`, so the
    // pin scanner needs to handle this form too.
    const a = createItem({
      identifier: '@rack/a',
      registryDependencies: ['runtimes/node@1.0.0']
    })

    await expect(
      resolveRegistryDependencies([a], createMockLogger())
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  })
})
