import { describe, it, expect } from 'vitest'
import { validateNoConflicts } from '../../../src/lib/pipeline/conflict.js'
import { ConflictError } from '../../../src/lib/utils/errors.js'
import { createItem } from '../../helpers/mocks.js'

describe('pipeline/conflict', () => {
  it('no-ops on an empty list', () => {
    expect(() => validateNoConflicts([])).not.toThrow()
  })

  it('passes when no conflicts are declared', () => {
    expect(() =>
      validateNoConflicts([
        createItem({ identifier: '@rack/a' }),
        createItem({ identifier: '@rack/b' })
      ])
    ).not.toThrow()
  })

  it('throws ConflictError when a declared conflict coexists', () => {
    const err = (() => {
      try {
        validateNoConflicts([
          createItem({
            identifier: '@rack/a',
            conflicts: ['@rack/b']
          }),
          createItem({ identifier: '@rack/b' })
        ])
      } catch (e) {
        return e
      }
    })()
    expect(err).toBeInstanceOf(ConflictError)
    expect((err as ConflictError).conflicts).toEqual([
      { identifier: '@rack/a', conflictsWith: '@rack/b' }
    ])
  })

  it('strips version suffix when comparing conflict names', () => {
    expect(() =>
      validateNoConflicts([
        createItem({
          identifier: '@rack/a@1.0.0',
          conflicts: ['@rack/b@2.0.0']
        }),
        createItem({ identifier: '@rack/b@1.0.0' })
      ])
    ).toThrow(ConflictError)
  })

  it('does not report self-conflicts', () => {
    expect(() =>
      validateNoConflicts([
        createItem({ identifier: '@rack/a', conflicts: ['@rack/a'] })
      ])
    ).not.toThrow()
  })

  it('handles items without a conflicts field', () => {
    expect(() =>
      validateNoConflicts([createItem({ identifier: '@rack/a' })])
    ).not.toThrow()
  })

  it('ignores conflicts that target registries not present in the set', () => {
    expect(() =>
      validateNoConflicts([
        createItem({ identifier: '@rack/a', conflicts: ['@rack/ghost'] })
      ])
    ).not.toThrow()
  })
})
