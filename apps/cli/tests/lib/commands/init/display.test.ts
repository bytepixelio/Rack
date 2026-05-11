import { it, vi, expect, describe } from 'vitest'
import { createMockLogger } from '../../../helpers/mocks.js'
import {
  displayCIMode,
  displayResults,
  displayProjectInfo,
  displayManifestGenerated
} from '../../../../src/lib/commands/init/display.js'

function pipelineResult(overrides = {}) {
  return {
    targetDir: '/t',
    appliedRegistries: ['@rack/vue'],
    items: [],
    initialRegistries: ['@rack/vue'],
    fileChanges: [],
    dependencies: {},
    devDependencies: {},
    scripts: {},
    ...overrides
  }
}

describe('init/display', () => {
  it('displayCIMode prints a CI banner', () => {
    const logger = createMockLogger()
    displayCIMode(logger)
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('CI mode'))
  })

  it('displayProjectInfo prints name, template, and target dir', () => {
    const logger = createMockLogger()
    displayProjectInfo(
      { projectName: 'demo', template: '@presets/vue', targetDir: '/t' },
      logger
    )
    const out = (logger.info as ReturnType<typeof vi.fn>).mock.calls
      .flat()
      .join(' ')
    expect(out).toContain('demo')
    expect(out).toContain('@presets/vue')
    expect(out).toContain('/t')
  })

  it('displayManifestGenerated prints confirmation', () => {
    const logger = createMockLogger()
    displayManifestGenerated(logger)
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('rack.json')
    )
  })

  it('displayResults shows full summary including warnings', () => {
    const logger = createMockLogger()
    displayResults(
      {
        pipelineResult: pipelineResult({
          fileChanges: [
            { path: 'a', type: 'created' },
            { path: 'b', type: 'modified' },
            { path: 'c', type: 'skipped' }
          ],
          dependencies: { x: '1' },
          devDependencies: { y: '2' }
        }),
        warnings: ['git missing']
      },
      logger
    )
    const out = (logger.info as ReturnType<typeof vi.fn>).mock.calls
      .flat()
      .join(' ')
    expect(out).toContain('Initialization completed')
    expect(out).toContain('Happy coding')
    const warn = (logger.warn as ReturnType<typeof vi.fn>).mock.calls
      .flat()
      .join(' ')
    expect(warn).toContain('git missing')
  })

  it('omits file change and dependency sections when empty', () => {
    const logger = createMockLogger()
    displayResults({ pipelineResult: pipelineResult(), warnings: [] }, logger)
    const out = (logger.info as ReturnType<typeof vi.fn>).mock.calls
      .flat()
      .join(' ')
    expect(out).not.toContain('File changes')
    expect(out).not.toContain('Dependencies')
  })
})
