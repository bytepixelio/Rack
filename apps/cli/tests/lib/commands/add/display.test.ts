import { describe, it, expect, vi } from 'vitest'
import {
  displayHeader,
  displayResults,
  displayAlreadyInstalled
} from '../../../../src/lib/commands/add/display.js'
import type { PipelineResult } from '../../../../src/lib/pipeline/types.js'
import { createMockLogger } from '../../../helpers/mocks.js'

function pipelineResult(
  overrides: Partial<PipelineResult> = {}
): PipelineResult {
  return {
    targetDir: '/t',
    appliedRegistries: ['@rack/a'],
    items: [],
    initialRegistries: ['@rack/a'],
    fileChanges: [],
    dependencies: {},
    devDependencies: {},
    scripts: {},
    ...overrides
  }
}

describe('add/display', () => {
  it('displayHeader includes the registry identifier', () => {
    const logger = createMockLogger()
    displayHeader('@rack/vue', logger)
    const out = (logger.info as ReturnType<typeof vi.fn>).mock.calls
      .flat()
      .join(' ')
    expect(out).toContain('@rack/vue')
  })

  it('displayAlreadyInstalled prints a yellow notice', () => {
    const logger = createMockLogger()
    displayAlreadyInstalled('@rack/vue', logger)
    const out = (logger.info as ReturnType<typeof vi.fn>).mock.calls
      .flat()
      .join(' ')
    expect(out).toContain('already installed')
  })

  it('displayResults prints applied, file changes, and dependency summaries', () => {
    const logger = createMockLogger()
    displayResults(
      pipelineResult({
        appliedRegistries: ['@rack/a', '@rack/b'],
        fileChanges: [
          { path: 'a', type: 'created' },
          { path: 'b', type: 'modified' },
          { path: 'c', type: 'skipped' }
        ],
        dependencies: { x: '1' },
        devDependencies: { y: '2' }
      }),
      logger
    )
    const out = (logger.info as ReturnType<typeof vi.fn>).mock.calls
      .flat()
      .join(' ')
    expect(out).toContain('Applied')
    expect(out).toContain('File changes')
    expect(out).toContain('Dependencies')
    expect(out).toContain('Created')
    expect(out).toContain('Modified')
  })

  it('displayResults omits file changes section when all counts are zero', () => {
    const logger = createMockLogger()
    displayResults(pipelineResult(), logger)
    const out = (logger.info as ReturnType<typeof vi.fn>).mock.calls
      .flat()
      .join(' ')
    expect(out).not.toContain('File changes')
  })

  it('displayResults omits dependency section when all counts are zero', () => {
    const logger = createMockLogger()
    displayResults(pipelineResult(), logger)
    const out = (logger.info as ReturnType<typeof vi.fn>).mock.calls
      .flat()
      .join(' ')
    expect(out).not.toContain('Dependencies')
  })
})
