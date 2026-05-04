import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../../../src/lib/pipeline/merge/plugin-loader.js', () => ({
  executePlugin: vi.fn()
}))

import {
  merge,
  mergeBuiltin,
  resolveStrategy
} from '../../../../src/lib/pipeline/merge/index.js'
import { executePlugin } from '../../../../src/lib/pipeline/merge/plugin-loader.js'
import { MergeError } from '../../../../src/lib/utils/errors.js'

const executePluginMock = executePlugin as unknown as ReturnType<typeof vi.fn>

beforeEach(() => executePluginMock.mockReset())
afterEach(() => vi.restoreAllMocks())

describe('merge/index resolveStrategy', () => {
  it('detects json strategy from well-known config files', () => {
    expect(resolveStrategy('package.json')).toBe('json')
    expect(resolveStrategy('tsconfig.json')).toBe('json')
  })

  it('detects json strategy from .schema.json suffix', () => {
    expect(resolveStrategy('foo.schema.json')).toBe('json')
  })

  it('detects ignore strategy for .gitignore family', () => {
    expect(resolveStrategy('.gitignore')).toBe('ignore')
    expect(resolveStrategy('.dockerignore')).toBe('ignore')
  })

  it('detects env strategy for .env files', () => {
    expect(resolveStrategy('.env')).toBe('env')
    expect(resolveStrategy('.env.local')).toBe('env')
  })

  it('defaults to overwrite strategy', () => {
    expect(resolveStrategy('README.md')).toBe('overwrite')
  })

  it('honors explicit builtin strategy declarations', () => {
    expect(
      resolveStrategy('x.txt', {
        type: 'asset',
        target: 'x',
        mergeStrategy: { type: 'builtin', strategy: 'overwrite' }
      })
    ).toBe('overwrite')
  })

  it('returns the full config object for custom strategies', () => {
    const cfg = {
      type: 'custom' as const,
      script: './merge.js'
    }
    expect(
      resolveStrategy('x.txt', {
        type: 'asset',
        target: 'x',
        mergeStrategy: cfg
      })
    ).toEqual(cfg)
  })
})

describe('merge/index mergeBuiltin', () => {
  it('attaches the requested strategy id to the result', () => {
    const res = mergeBuiltin('overwrite', {
      filePath: 'x.txt',
      currentContent: null,
      incomingContent: 'hi'
    })
    expect(res.strategy).toBe('overwrite')
  })

  it('throws MergeError for an unknown strategy id', () => {
    expect(() =>
      mergeBuiltin('bogus' as never, {
        filePath: 'x',
        currentContent: null,
        incomingContent: 'a'
      })
    ).toThrow(MergeError)
  })
})

describe('merge/index merge', () => {
  it('dispatches builtin strategies through mergeBuiltin', async () => {
    const res = await merge({
      filePath: 'package.json',
      currentContent: '{"name":"a"}',
      incomingContent: '{"version":"1"}'
    })
    expect(res.strategy).toBe('json')
    expect(JSON.parse(res.content)).toEqual({ name: 'a', version: '1' })
  })

  it('throws MergeError when registryUrl is missing for custom strategy', async () => {
    await expect(
      merge({
        filePath: 'x.ts',
        currentContent: null,
        incomingContent: 'a',
        file: {
          type: 'asset',
          target: 'x.ts',
          mergeStrategy: { type: 'custom', script: './m.js' }
        }
      })
    ).rejects.toBeInstanceOf(MergeError)
  })

  it('delegates custom strategies to executePlugin', async () => {
    executePluginMock.mockResolvedValue({
      content: 'ok',
      strategy: 'custom',
      warnings: [],
      changed: true
    })
    const res = await merge({
      filePath: 'x.ts',
      currentContent: null,
      incomingContent: 'a',
      registryUrl: 'https://r.com/registries/@rack/x/1.0.0',
      language: 'ts',
      file: {
        type: 'asset',
        target: 'x.ts',
        mergeStrategy: { type: 'custom', script: './m.js' }
      }
    })
    expect(executePluginMock).toHaveBeenCalled()
    expect(res.content).toBe('ok')
  })
})
