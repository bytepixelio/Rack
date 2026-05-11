import { it, expect, describe } from 'vitest'
import { createItem } from '../../helpers/mocks.js'
import { sortItems } from '../../../src/lib/pipeline/sort.js'
import { CircularDependencyError } from '../../../src/lib/utils/errors.js'

describe('pipeline/sort', () => {
  it('returns empty array for empty input', () => {
    expect(sortItems([])).toEqual([])
  })

  it('returns a single item as-is', () => {
    const items = [createItem({ identifier: 'a' })]
    expect(sortItems(items).map((i) => i.identifier)).toEqual(['a'])
  })

  it('orders dependencies before dependents regardless of priority', () => {
    const a = createItem({
      identifier: 'a',
      priority: 2,
      registryDependencies: ['b']
    })
    const b = createItem({ identifier: 'b', priority: 4 })
    expect(sortItems([a, b]).map((i) => i.identifier)).toEqual(['b', 'a'])
  })

  it('sorts items at the same dependency level by priority ascending', () => {
    const x = createItem({ identifier: 'x', priority: 5 })
    const y = createItem({ identifier: 'y', priority: 1 })
    expect(sortItems([x, y]).map((i) => i.identifier)).toEqual(['y', 'x'])
  })

  it('handles transitive dependency chains', () => {
    const a = createItem({ identifier: 'a', registryDependencies: ['b'] })
    const b = createItem({ identifier: 'b', registryDependencies: ['c'] })
    const c = createItem({ identifier: 'c' })
    expect(sortItems([a, b, c]).map((i) => i.identifier)).toEqual([
      'c',
      'b',
      'a'
    ])
  })

  it('throws CircularDependencyError with the cycle path', () => {
    const a = createItem({ identifier: 'a', registryDependencies: ['b'] })
    const b = createItem({ identifier: 'b', registryDependencies: ['a'] })
    const err = (() => {
      try {
        sortItems([a, b])
      } catch (e) {
        return e
      }
    })()
    expect(err).toBeInstanceOf(CircularDependencyError)
    expect((err as CircularDependencyError).cycle.length).toBeGreaterThan(0)
  })

  it('puts a shared dependency before its dependents', () => {
    const base = createItem({ identifier: 'base' })
    const a = createItem({ identifier: 'a', registryDependencies: ['base'] })
    const b = createItem({ identifier: 'b', registryDependencies: ['base'] })
    const sorted = sortItems([a, b, base]).map((i) => i.identifier)
    expect(sorted[0]).toBe('base')
  })

  it('canonicalizes identifiers so shorthand deps resolve to full-form items', () => {
    const a = createItem({ identifier: '@rack/a' })
    const b = createItem({
      identifier: '@rack/b',
      registryDependencies: ['a']
    })
    const c = createItem({
      identifier: '@rack/c',
      registryDependencies: ['b']
    })
    expect(sortItems([c, b, a]).map((i) => i.identifier)).toEqual([
      '@rack/a',
      '@rack/b',
      '@rack/c'
    ])
  })

  it('does not mutate the input array', () => {
    const items = [
      createItem({ identifier: 'x', priority: 2 }),
      createItem({ identifier: 'y', priority: 1 })
    ]
    const before = items.map((i) => i.identifier)
    sortItems(items)
    expect(items.map((i) => i.identifier)).toEqual(before)
  })
})
