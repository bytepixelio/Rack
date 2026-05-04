import { describe, it, expect } from 'vitest'
import {
  logConflicts,
  resolveDependencies
} from '../../../src/lib/pipeline/resolve-versions.js'
import { createItem, createMockLogger } from '../../helpers/mocks.js'

describe('pipeline/resolve-versions resolveDependencies', () => {
  it('keeps a singly-declared version without marking a conflict', () => {
    const items = [
      createItem({ identifier: 'a', dependencies: { lodash: '^4.0.0' } })
    ]
    const res = resolveDependencies(items)
    expect(res.dependencies).toEqual({ lodash: '^4.0.0' })
    expect(res.conflicts).toEqual([])
  })

  it('resolves identical versions as "same" strategy without conflict', () => {
    const items = [
      createItem({ identifier: 'a', dependencies: { lodash: '^4.0.0' } }),
      createItem({ identifier: 'b', dependencies: { lodash: '^4.0.0' } })
    ]
    const res = resolveDependencies(items)
    expect(res.dependencies.lodash).toBe('^4.0.0')
    expect(res.conflicts).toEqual([])
  })

  it('picks the max-min compatible range when ranges intersect', () => {
    const items = [
      createItem({ identifier: 'a', dependencies: { x: '^1.2.0' } }),
      createItem({ identifier: 'b', dependencies: { x: '^1.5.0' } })
    ]
    const res = resolveDependencies(items)
    expect(res.dependencies.x).toBe('^1.5.0')
    expect(res.conflicts[0].strategy).toBe('compatible')
  })

  it('keeps the leading range when its minVersion is already the maximum', () => {
    const items = [
      createItem({ identifier: 'a', dependencies: { x: '^1.5.0' } }),
      createItem({ identifier: 'b', dependencies: { x: '^1.2.0' } })
    ]
    const res = resolveDependencies(items)
    expect(res.dependencies.x).toBe('^1.5.0')
  })

  it('falls back to priority when ranges are incompatible', () => {
    const items = [
      createItem({
        identifier: 'a',
        priority: 1,
        dependencies: { x: '^1.0.0' }
      }),
      createItem({
        identifier: 'b',
        priority: 5,
        dependencies: { x: '^2.0.0' }
      })
    ]
    const res = resolveDependencies(items)
    expect(res.dependencies.x).toBe('^1.0.0')
    expect(res.conflicts[0].strategy).toBe('priority')
  })

  it('falls back to priority when every valid range has no minVersion', () => {
    const items = [
      createItem({
        identifier: 'a',
        priority: 1,
        dependencies: { x: '<0.0.0-0' }
      }),
      createItem({
        identifier: 'b',
        priority: 2,
        dependencies: { x: '<0.0.0' }
      })
    ]
    const res = resolveDependencies(items)
    expect(res.conflicts[0].strategy).toBe('priority')
  })

  it('falls back to priority when no ranges are valid semver', () => {
    const items = [
      createItem({
        identifier: 'a',
        priority: 2,
        dependencies: { x: 'weird' }
      }),
      createItem({
        identifier: 'b',
        priority: 1,
        dependencies: { x: 'also-weird' }
      })
    ]
    const res = resolveDependencies(items)
    expect(res.dependencies.x).toBe('also-weird')
    expect(res.conflicts[0].strategy).toBe('priority')
  })

  it('processes devDependencies alongside dependencies', () => {
    const items = [
      createItem({
        identifier: 'a',
        devDependencies: { vitest: '^1.0.0' }
      })
    ]
    const res = resolveDependencies(items)
    expect(res.devDependencies).toEqual({ vitest: '^1.0.0' })
  })

  it('handles items with no dependencies or devDependencies', () => {
    const res = resolveDependencies([createItem({ identifier: 'a' })])
    expect(res.dependencies).toEqual({})
    expect(res.devDependencies).toEqual({})
  })
})

describe('pipeline/resolve-versions logConflicts', () => {
  it('no-ops when there are no conflicts', () => {
    const logger = createMockLogger()
    logConflicts([], logger)
    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.debug).not.toHaveBeenCalled()
  })

  it('emits one warn line and one debug line per conflict', () => {
    const logger = createMockLogger()
    logConflicts(
      [
        {
          package: 'x',
          versions: [
            { version: '^1.0.0', registry: 'a', priority: 1 },
            { version: '^2.0.0', registry: 'b', priority: 2 }
          ],
          resolvedVersion: '^1.0.0',
          strategy: 'priority'
        }
      ],
      logger
    )
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('1 dependency version conflict')
    )
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('x: a@^1.0.0, b@^2.0.0 → ^1.0.0 (priority)')
    )
  })
})
