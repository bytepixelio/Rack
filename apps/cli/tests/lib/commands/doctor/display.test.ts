import { it, vi, expect, describe } from 'vitest'
import { createMockLogger } from '../../../helpers/mocks.js'
import { displayReport } from '../../../../src/lib/commands/doctor/display.js'

import type { CheckSummary } from '../../../../src/lib/commands/doctor/checks.js'

function summary(results: CheckSummary['results']): CheckSummary {
  return {
    results,
    hasErrors: results.some((r) => r.level === 'error')
  }
}

describe('doctor/display', () => {
  it('shows all-passed footer when no issues are found', () => {
    const logger = createMockLogger()
    displayReport(
      summary([
        {
          id: 'env.node-version',
          level: 'info',
          category: 'environment',
          message: 'node ok'
        }
      ]),
      logger
    )
    const calls = (logger.info as ReturnType<typeof vi.fn>).mock.calls
      .flat()
      .join(' ')
    expect(calls).toContain('All checks passed')
  })

  it('shows warning footer when only warnings are present', () => {
    const logger = createMockLogger()
    displayReport(
      summary([
        {
          id: 'env.git',
          level: 'warning',
          category: 'environment',
          message: 'git missing'
        }
      ]),
      logger
    )
    const calls = (logger.info as ReturnType<typeof vi.fn>).mock.calls
      .flat()
      .join(' ')
    expect(calls).toMatch(/1 warning/)
  })

  it('shows error footer including warning count', () => {
    const logger = createMockLogger()
    displayReport(
      summary([
        {
          id: 'env.node-version',
          level: 'error',
          category: 'environment',
          message: 'bad'
        },
        {
          id: 'env.git',
          level: 'warning',
          category: 'environment',
          message: 'git missing'
        }
      ]),
      logger
    )
    const calls = (logger.info as ReturnType<typeof vi.fn>).mock.calls
      .flat()
      .join(' ')
    expect(calls).toMatch(/1 error\(s\).*1 warning/)
  })

  it('only prints suggestion line when suggestion is present', () => {
    const logger = createMockLogger()
    displayReport(
      summary([
        {
          id: 'env.node-version',
          level: 'error',
          category: 'environment',
          message: 'bad',
          suggestion: 'upgrade'
        }
      ]),
      logger
    )
    const calls = (logger.info as ReturnType<typeof vi.fn>).mock.calls
      .flat()
      .join(' ')
    expect(calls).toContain('upgrade')
  })

  it('skips categories with no results', () => {
    const logger = createMockLogger()
    displayReport(
      summary([
        {
          id: 'env.node-version',
          level: 'info',
          category: 'environment',
          message: 'node ok'
        }
      ]),
      logger
    )
    const calls = (logger.info as ReturnType<typeof vi.fn>).mock.calls
      .flat()
      .join(' ')
    expect(calls).not.toContain('Project')
    expect(calls).not.toContain('Remote')
  })
})
