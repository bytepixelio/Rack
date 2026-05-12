import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest'

vi.mock('../../../../src/lib/commands/init/fetch.js', () => ({
  fetchTemplate: vi.fn()
}))
vi.mock('../../../../src/lib/registry/client.js', () => ({
  registry: { fetchItem: vi.fn(), fetchItems: vi.fn() }
}))
vi.mock('../../../../src/lib/pipeline/apply.js', () => ({
  applyFiles: vi.fn()
}))
vi.mock('../../../../src/lib/pipeline/preflight.js', () => ({
  preflight: vi.fn()
}))
vi.mock('../../../../src/lib/pkg.js', () => ({ pkg: { update: vi.fn() } }))

import { pkg } from '../../../../src/lib/pkg.js'
import { registry } from '../../../../src/lib/registry/client.js'
import { applyFiles } from '../../../../src/lib/pipeline/apply.js'
import { ConflictError } from '../../../../src/lib/utils/errors.js'
import { createItem, createMockLogger } from '../../../helpers/mocks.js'
import { fetchTemplate } from '../../../../src/lib/commands/init/fetch.js'
import { initProject } from '../../../../src/lib/commands/init/pipeline.js'

const fetchTemplateMock = fetchTemplate as unknown as ReturnType<typeof vi.fn>
const fetchItemsMock = registry.fetchItems as unknown as ReturnType<
  typeof vi.fn
>
const applyMock = applyFiles as unknown as ReturnType<typeof vi.fn>
const pkgUpdateMock = pkg.update as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchTemplateMock.mockReset()
  fetchItemsMock.mockReset()
  applyMock.mockReset()
  pkgUpdateMock.mockReset()
  fetchItemsMock.mockResolvedValue([])
  applyMock.mockResolvedValue([])
  pkgUpdateMock.mockResolvedValue({})
})
afterEach(() => vi.restoreAllMocks())

describe('init/pipeline initProject', () => {
  it('executes the full init flow and returns pipeline result', async () => {
    fetchTemplateMock.mockResolvedValue([
      createItem({ identifier: '@rack/vue', scripts: { dev: 'vite' } })
    ])
    const result = await initProject(
      { template: '@rack/vue', targetDir: '/t' },
      'ts',
      createMockLogger()
    )
    expect(result.initialRegistries).toEqual(['@rack/vue'])
    // appliedRegistries comes from plan.toRecord, which pins the
    // server-returned version — see §6.10.
    expect(result.appliedRegistries).toEqual(['@rack/vue@1.0.0'])
    expect(result.scripts).toEqual({ dev: 'vite' })
    expect(pkgUpdateMock).toHaveBeenCalledWith('/t', expect.any(Object))
  })

  it('surfaces conflict errors from validateNoConflicts', async () => {
    fetchTemplateMock.mockResolvedValue([
      createItem({ identifier: '@rack/a', conflicts: ['@rack/b'] }),
      createItem({ identifier: '@rack/b' })
    ])
    await expect(
      initProject(
        { template: '@rack/a', targetDir: '/t' },
        undefined,
        createMockLogger()
      )
    ).rejects.toBeInstanceOf(ConflictError)
  })

  it('handles items without scripts field', async () => {
    fetchTemplateMock.mockResolvedValue([
      createItem({ identifier: '@rack/vue' })
    ])
    const result = await initProject(
      { template: '@rack/vue', targetDir: '/t' },
      undefined,
      createMockLogger()
    )
    expect(result.scripts).toEqual({})
  })
})
