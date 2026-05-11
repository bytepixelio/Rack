import { join, basename } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { makeTmpDir, cleanTmpDir } from '../../../helpers/tmp.js'
import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest'

vi.mock('../../../../src/lib/registry/client.js', () => ({
  registry: { fetchFile: vi.fn() }
}))

import { registry } from '../../../../src/lib/registry/client.js'
import { executePlugin } from '../../../../src/lib/pipeline/merge/plugin-loader.js'

const fetchFileMock = registry.fetchFile as unknown as ReturnType<typeof vi.fn>

describe('merge/plugin-loader', () => {
  let tmp: string
  beforeEach(async () => {
    tmp = await makeTmpDir('plugin')
    fetchFileMock.mockReset()
  })
  afterEach(async () => {
    await cleanTmpDir(tmp)
    vi.restoreAllMocks()
  })

  it('throws when mergeStrategy.script is missing', async () => {
    await expect(
      executePlugin(
        { type: 'custom' },
        'https://r.com/registries/@rack/x/1.0.0',
        { filePath: 'x', currentContent: null, incomingContent: 'a' },
        {}
      )
    ).rejects.toThrow(/script path must be provided/)
  })

  it('downloads and executes a remote plugin', async () => {
    const pluginSrc = `export function merge(params) {
      return { content: params.incomingContent + '!', changed: true, warnings: [] }
    }`
    fetchFileMock.mockResolvedValue(pluginSrc)

    const res = await executePlugin(
      { type: 'custom', script: './merge.mjs' },
      'https://r.com/registries/@rack/x/1.0.0',
      { filePath: 'x', currentContent: null, incomingContent: 'a' },
      {}
    )
    expect(res.content).toBe('a!')
    expect(res.strategy).toBe('custom')
  })

  it('loads a local plugin and executes its merge function', async () => {
    const script = join(tmp, 'merge.mjs')
    await writeFile(
      script,
      `export function merge(params) {
        return { content: 'local:' + params.incomingContent, changed: true, warnings: [] }
      }`
    )
    const registryUrl = `file://${join(tmp, 'registry.json')}`
    const res = await executePlugin(
      { type: 'custom', script: 'merge.mjs' },
      registryUrl,
      { filePath: 'x', currentContent: null, incomingContent: 'hi' },
      {}
    )
    expect(res.content).toBe('local:hi')
  })

  it('rejects local plugin paths that escape the registry root', async () => {
    const registryUrl = `file://${join(tmp, 'registry.json')}`
    await expect(
      executePlugin(
        { type: 'custom', script: '../../../../../etc/passwd' },
        registryUrl,
        { filePath: 'x', currentContent: null, incomingContent: 'a' },
        {}
      )
    ).rejects.toThrow(/path traversal|Plugin execution failed/)
  })

  it('rejects sibling-prefix paths that share a common prefix with root', async () => {
    const sibling = `../${basename(tmp)}-evil/merge.mjs`
    const registryUrl = `file://${join(tmp, 'registry.json')}`
    await expect(
      executePlugin(
        { type: 'custom', script: sibling },
        registryUrl,
        { filePath: 'x', currentContent: null, incomingContent: 'a' },
        {}
      )
    ).rejects.toThrow(/path traversal|Plugin execution failed/)
  })

  it('throws when the plugin does not export a merge function', async () => {
    const script = join(tmp, 'no-merge.mjs')
    await writeFile(script, `export const other = 1`)
    const registryUrl = `file://${join(tmp, 'registry.json')}`
    await expect(
      executePlugin(
        { type: 'custom', script: 'no-merge.mjs' },
        registryUrl,
        { filePath: 'x', currentContent: null, incomingContent: 'a' },
        {}
      )
    ).rejects.toThrow(/must export a 'merge' function|execution failed/)
  })

  it('throws when plugin result is not a valid MergeResult', async () => {
    const script = join(tmp, 'bad-result.mjs')
    await writeFile(script, `export function merge() { return 42 }`)
    const registryUrl = `file://${join(tmp, 'registry.json')}`
    await expect(
      executePlugin(
        { type: 'custom', script: 'bad-result.mjs' },
        registryUrl,
        { filePath: 'x', currentContent: null, incomingContent: 'a' },
        {}
      )
    ).rejects.toThrow(/MergeResult|execution failed/)
  })

  it('throws when the plugin file cannot be loaded at all', async () => {
    const script = join(tmp, 'broken.mjs')
    await writeFile(script, `syntax ((( error`)
    const registryUrl = `file://${join(tmp, 'registry.json')}`
    await expect(
      executePlugin(
        { type: 'custom', script: 'broken.mjs' },
        registryUrl,
        { filePath: 'x', currentContent: null, incomingContent: 'a' },
        {}
      )
    ).rejects.toThrow(/Plugin execution failed|Failed to load plugin/)
  })

  it('falls back to default changed=true and warnings=[] when plugin omits them', async () => {
    const script = join(tmp, 'minimal.mjs')
    await writeFile(
      script,
      `export function merge() { return { content: 'x' } }`
    )
    const registryUrl = `file://${join(tmp, 'registry.json')}`
    const res = await executePlugin(
      { type: 'custom', script: 'minimal.mjs' },
      registryUrl,
      { filePath: 'x', currentContent: null, incomingContent: 'a' },
      {}
    )
    expect(res.changed).toBe(true)
    expect(res.warnings).toEqual([])
  })

  it('falls back to .js extension when the remote script has no extension', async () => {
    fetchFileMock.mockResolvedValue(
      `export function merge() { return { content: 'ok' } }`
    )
    const res = await executePlugin(
      { type: 'custom', script: 'merge' },
      'https://r.com/registries/@rack/x/1.0.0',
      { filePath: 'x', currentContent: null, incomingContent: 'a' },
      {}
    )
    expect(res.content).toBe('ok')
  })

  it('falls back to CommonJS require when ESM import fails', async () => {
    const folder = join(tmp, 'cjs-plugin')
    await mkdir(folder, { recursive: true })
    await writeFile(
      join(folder, 'package.json'),
      JSON.stringify({ type: 'commonjs' })
    )
    const script = join(folder, 'plugin.cjs')
    await writeFile(
      script,
      `module.exports.merge = function(p) { return { content: 'cjs:' + p.incomingContent, changed: true, warnings: [] } }`
    )
    const registryUrl = `file://${join(folder, 'registry.json')}`
    const res = await executePlugin(
      { type: 'custom', script: 'plugin.cjs' },
      registryUrl,
      { filePath: 'x', currentContent: null, incomingContent: 'hi' },
      {}
    )
    expect(res.content).toBe('cjs:hi')
  })
})
