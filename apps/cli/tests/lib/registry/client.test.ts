import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest'

vi.mock('../../../src/lib/rackrc.js', () => ({
  rackrc: {
    getRegistry: vi.fn()
  }
}))

vi.mock('../../../src/lib/infra/http.js', () => {
  const get = vi.fn()
  const getBuffer = vi.fn()
  return {
    HttpClient: vi.fn().mockImplementation(() => ({ get, getBuffer })),
    __http: { get, getBuffer }
  }
})

import { rackrc } from '../../../src/lib/rackrc.js'
import * as httpMod from '../../../src/lib/infra/http.js'
import { createMockLogger } from '../../helpers/mocks.js'
import { registry } from '../../../src/lib/registry/client.js'
import {
  AppError,
  HttpError,
  RegistryNotFoundError
} from '../../../src/lib/utils/errors.js'

const http = (
  httpMod as unknown as {
    __http: {
      get: ReturnType<typeof vi.fn>
      getBuffer: ReturnType<typeof vi.fn>
    }
  }
).__http
const getRegistryMock = rackrc.getRegistry as unknown as ReturnType<
  typeof vi.fn
>

const baseItem = {
  name: 'vue',
  type: 'registry:framework',
  version: '1.0.0',
  priority: 2,
  namespace: '@rack'
}

beforeEach(() => {
  http.get.mockReset()
  http.getBuffer.mockReset()
  getRegistryMock.mockReset()
})
afterEach(() => vi.restoreAllMocks())

describe('registry/client fetchItem', () => {
  it('fetches a versioned identifier and attaches provenance metadata', async () => {
    getRegistryMock.mockResolvedValue({
      url: 'https://r.example.com',
      headers: { Authorization: 'Bearer T' }
    })
    http.get.mockResolvedValue({ data: baseItem })

    const item = await registry.fetchItem('@rack/vue@1.0.0')
    expect(http.get).toHaveBeenCalledWith(
      'https://r.example.com/registries/@rack/vue/1.0.0',
      { headers: { Authorization: 'Bearer T' } }
    )
    expect(item.identifier).toBe('@rack/vue@1.0.0')
    expect(item.registryUrl).toBe(
      'https://r.example.com/registries/@rack/vue/1.0.0'
    )
  })

  it('preserves @version and :language suffixes in canonical identifier', async () => {
    getRegistryMock.mockResolvedValue({ url: 'https://r.example.com' })
    http.get.mockResolvedValue({ data: baseItem })

    const item = await registry.fetchItem('@RACK/Vue@1.0.0:js')
    expect(item.identifier).toBe('@rack/vue@1.0.0:js')
  })

  it('omits version/language suffix when identifier had none', async () => {
    getRegistryMock.mockResolvedValue({ url: 'https://r.example.com' })
    http.get.mockResolvedValue({ data: baseItem })

    const item = await registry.fetchItem('@rack/vue')
    expect(item.identifier).toBe('@rack/vue')
  })

  it('pins server-returned item.version into resolvedIdentifier for unpinned requests', async () => {
    // Without this pin, an unpinned `@rack/vue` request would land in
    // rack.json.items as `@rack/vue` and a later `rk add @rack/vue@1.0.0`
    // would trip VERSION_MISMATCH against an effectively-equal install.
    getRegistryMock.mockResolvedValue({ url: 'https://r.example.com' })
    http.get.mockResolvedValue({ data: baseItem })

    const item = await registry.fetchItem('@rack/vue')
    expect(item.resolvedIdentifier).toBe('@rack/vue@1.0.0')
  })

  it('preserves an explicit :language in resolvedIdentifier', async () => {
    getRegistryMock.mockResolvedValue({ url: 'https://r.example.com' })
    http.get.mockResolvedValue({ data: baseItem })

    const item = await registry.fetchItem('@rack/vue:js')
    expect(item.resolvedIdentifier).toBe('@rack/vue@1.0.0:js')
  })

  it('keeps the pinned version unchanged in resolvedIdentifier when caller already pinned it', async () => {
    getRegistryMock.mockResolvedValue({ url: 'https://r.example.com' })
    http.get.mockResolvedValue({ data: baseItem })

    const item = await registry.fetchItem('@rack/vue@1.0.0')
    expect(item.resolvedIdentifier).toBe('@rack/vue@1.0.0')
  })

  it('strips trailing slashes from the registry base URL', async () => {
    getRegistryMock.mockResolvedValue({ url: 'https://r.example.com///' })
    http.get.mockResolvedValue({ data: baseItem })
    await registry.fetchItem('@rack/vue@1.0.0')
    expect(http.get.mock.calls[0][0]).toBe(
      'https://r.example.com/registries/@rack/vue/1.0.0'
    )
  })

  it('injects item.version into registryUrl for unversioned identifiers', async () => {
    getRegistryMock.mockResolvedValue({ url: 'https://r.example.com' })
    http.get.mockResolvedValue({ data: baseItem })
    const item = await registry.fetchItem('@rack/vue')
    expect(item.registryUrl).toBe(
      'https://r.example.com/registries/@rack/vue/1.0.0'
    )
  })

  it('applies language overrides when options.language is set', async () => {
    getRegistryMock.mockResolvedValue({ url: 'https://r.example.com' })
    http.get.mockResolvedValue({
      data: {
        ...baseItem,
        dependencies: { a: '1' },
        languages: {
          ts: { dependencies: { b: '2' } }
        }
      }
    })
    const item = await registry.fetchItem('@rack/vue', { language: 'ts' })
    expect(item.dependencies).toEqual({ a: '1', b: '2' })
  })

  it('merges devDependencies from the language overlay', async () => {
    getRegistryMock.mockResolvedValue({ url: 'https://r.example.com' })
    http.get.mockResolvedValue({
      data: {
        ...baseItem,
        devDependencies: { eslint: '8' },
        languages: {
          ts: { devDependencies: { typescript: '5' } }
        }
      }
    })
    const item = await registry.fetchItem('@rack/vue', { language: 'ts' })
    expect(item.devDependencies).toEqual({ eslint: '8', typescript: '5' })
  })

  it('applies defaultLanguage override when no language option is supplied', async () => {
    getRegistryMock.mockResolvedValue({ url: 'https://r.example.com' })
    http.get.mockResolvedValue({
      data: {
        ...baseItem,
        defaultLanguage: 'js',
        languages: { js: { dependencies: { j: '1' } } }
      }
    })
    const item = await registry.fetchItem('@rack/vue')
    expect(item.dependencies).toEqual({ j: '1' })
  })

  it('attaches resolvedLanguage from identifier suffix (suffix wins over options.language)', async () => {
    getRegistryMock.mockResolvedValue({ url: 'https://r.example.com' })
    http.get.mockResolvedValue({ data: { ...baseItem, defaultLanguage: 'ts' } })

    const item = await registry.fetchItem('@rack/vue:js', { language: 'ts' })
    expect(item.resolvedLanguage).toBe('js')
  })

  it('attaches resolvedLanguage from options.language when no suffix', async () => {
    getRegistryMock.mockResolvedValue({ url: 'https://r.example.com' })
    http.get.mockResolvedValue({ data: { ...baseItem, defaultLanguage: 'ts' } })

    const item = await registry.fetchItem('@rack/vue', { language: 'js' })
    expect(item.resolvedLanguage).toBe('js')
  })

  it('falls back to defaultLanguage for resolvedLanguage when nothing else provided', async () => {
    getRegistryMock.mockResolvedValue({ url: 'https://r.example.com' })
    http.get.mockResolvedValue({ data: { ...baseItem, defaultLanguage: 'js' } })

    const item = await registry.fetchItem('@rack/vue')
    expect(item.resolvedLanguage).toBe('js')
  })

  it("defaults resolvedLanguage to 'ts' when nothing on item or call provides one", async () => {
    getRegistryMock.mockResolvedValue({ url: 'https://r.example.com' })
    http.get.mockResolvedValue({ data: baseItem })

    const item = await registry.fetchItem('@rack/vue')
    expect(item.resolvedLanguage).toBe('ts')
  })

  it('applies language override from identifier suffix (:lang)', async () => {
    getRegistryMock.mockResolvedValue({ url: 'https://r.example.com' })
    http.get.mockResolvedValue({
      data: {
        ...baseItem,
        files: [
          {
            path: 'tailwind.config.ts',
            target: 'tailwind.config.ts',
            type: 'registry:config'
          }
        ],
        languages: {
          js: {
            files: [
              {
                path: 'tailwind.config.js',
                target: 'tailwind.config.ts',
                type: 'registry:config'
              }
            ]
          }
        }
      }
    })
    const item = await registry.fetchItem('@rack/vue:js')
    expect(item.files).toEqual([
      {
        path: 'tailwind.config.js',
        target: 'tailwind.config.ts',
        type: 'registry:config'
      }
    ])
  })

  it('appends language files and preserves common files with different targets', async () => {
    getRegistryMock.mockResolvedValue({ url: 'https://r.example.com' })
    http.get.mockResolvedValue({
      data: {
        ...baseItem,
        files: [
          { path: 'index.html', target: 'index.html', type: 'registry:entry' },
          { path: 'shared.ts', target: 'src/shared.ts', type: 'registry:lib' }
        ],
        languages: {
          js: {
            files: [
              {
                path: 'tailwind.config.js',
                target: 'tailwind.config.js',
                type: 'registry:config'
              }
            ]
          }
        }
      }
    })
    const item = await registry.fetchItem('@rack/vue:js')
    expect(item.files).toEqual([
      { path: 'index.html', target: 'index.html', type: 'registry:entry' },
      { path: 'shared.ts', target: 'src/shared.ts', type: 'registry:lib' },
      {
        path: 'tailwind.config.js',
        target: 'tailwind.config.js',
        type: 'registry:config'
      }
    ])
  })

  it('uses language overlay files when base item has no files', async () => {
    getRegistryMock.mockResolvedValue({ url: 'https://r.example.com' })
    http.get.mockResolvedValue({
      data: {
        ...baseItem,
        languages: {
          js: {
            files: [
              {
                path: 'tailwind.config.js',
                target: 'tailwind.config.js',
                type: 'registry:config'
              }
            ]
          }
        }
      }
    })
    const item = await registry.fetchItem('@rack/vue:js')
    expect(item.files).toEqual([
      {
        path: 'tailwind.config.js',
        target: 'tailwind.config.js',
        type: 'registry:config'
      }
    ])
  })

  it('does not merge disallowed language block fields like scripts', async () => {
    getRegistryMock.mockResolvedValue({ url: 'https://r.example.com' })
    http.get.mockResolvedValue({
      data: {
        ...baseItem,
        scripts: { dev: 'vite' },
        languages: {
          ts: {
            scripts: { dev: 'vite --host' },
            dependencies: { x: '1' }
            // Intentionally malformed language overlay (extra `scripts`
            // key) — the test verifies the CLI drops disallowed fields.
          } as unknown as Record<string, unknown>
        }
      }
    })
    const item = await registry.fetchItem('@rack/vue', { language: 'ts' })
    expect(item.scripts).toEqual({ dev: 'vite' })
    expect(item.dependencies).toEqual({ x: '1' })
  })

  it('prefers identifier suffix over explicit options.language', async () => {
    getRegistryMock.mockResolvedValue({ url: 'https://r.example.com' })
    http.get.mockResolvedValue({
      data: {
        ...baseItem,
        languages: {
          ts: { dependencies: { t: '1' } },
          js: { dependencies: { j: '1' } }
        }
      }
    })
    const item = await registry.fetchItem('@rack/vue:js', { language: 'ts' })
    expect(item.dependencies).toEqual({ j: '1' })
  })

  it('throws when the registry item is missing required fields', async () => {
    getRegistryMock.mockResolvedValue({ url: 'https://r.example.com' })
    http.get.mockResolvedValue({ data: { name: 'vue' } })
    await expect(registry.fetchItem('@rack/vue')).rejects.toThrow(
      /Invalid registry item/
    )
  })

  it('translates 404 into RegistryNotFoundError', async () => {
    getRegistryMock.mockResolvedValue({ url: 'https://r.example.com' })
    http.get.mockRejectedValue(new HttpError('404', 404))
    await expect(registry.fetchItem('@rack/missing')).rejects.toBeInstanceOf(
      RegistryNotFoundError
    )
  })

  it('passes through non-404 HttpErrors', async () => {
    getRegistryMock.mockResolvedValue({ url: 'https://r.example.com' })
    http.get.mockRejectedValue(new HttpError('500', 500))
    await expect(registry.fetchItem('@rack/vue')).rejects.toMatchObject({
      status: 500
    })
  })

  it('throws when no registry is configured for the namespace', async () => {
    getRegistryMock.mockResolvedValue(null)
    await expect(registry.fetchItem('@acme/x')).rejects.toBeInstanceOf(
      RegistryNotFoundError
    )
  })
})

describe('registry/client fetchPreset', () => {
  const preset = {
    name: 'tutorial',
    version: '1.0.0',
    registries: ['@rack/vue']
  }

  it('fetches a preset via /presets/<name>', async () => {
    getRegistryMock.mockResolvedValue({ url: 'https://r.example.com/' })
    http.get.mockResolvedValue({ data: preset })
    const got = await registry.fetchPreset('@presets/tutorial')
    expect(http.get.mock.calls[0][0]).toBe(
      'https://r.example.com/presets/tutorial'
    )
    expect(got).toEqual(preset)
  })

  it('throws for an invalid preset payload', async () => {
    getRegistryMock.mockResolvedValue({ url: 'https://r.example.com' })
    http.get.mockResolvedValue({ data: { registries: null } })
    await expect(registry.fetchPreset('@presets/tutorial')).rejects.toThrow(
      /Invalid preset/
    )
  })

  it('translates 404 into RegistryNotFoundError for presets', async () => {
    getRegistryMock.mockResolvedValue({ url: 'https://r.example.com' })
    http.get.mockRejectedValue(new HttpError('404', 404))
    await expect(registry.fetchPreset('@presets/x')).rejects.toBeInstanceOf(
      RegistryNotFoundError
    )
  })

  it('passes through non-404 errors for presets', async () => {
    getRegistryMock.mockResolvedValue({ url: 'https://r.example.com' })
    http.get.mockRejectedValue(new HttpError('boom', 500))
    await expect(registry.fetchPreset('@presets/x')).rejects.toMatchObject({
      status: 500
    })
  })

  it('throws when no registry is configured for the preset namespace', async () => {
    getRegistryMock.mockResolvedValue(null)
    await expect(
      registry.fetchPreset('@presets/missing')
    ).rejects.toBeInstanceOf(RegistryNotFoundError)
  })

  it('rejects multi-segment preset paths', async () => {
    await expect(
      registry.fetchPreset('@presets/team/vue-app')
    ).rejects.toBeInstanceOf(AppError)
  })

  it('rejects preset with @version suffix', async () => {
    await expect(
      registry.fetchPreset('@presets/tutorial@1.0.0')
    ).rejects.toBeInstanceOf(AppError)
  })

  it('rejects preset with :language suffix', async () => {
    await expect(
      registry.fetchPreset('@presets/tutorial:ts')
    ).rejects.toBeInstanceOf(AppError)
  })
})

describe('registry/client fetchFile', () => {
  const registryUrl = 'https://r.example.com/registries/@rack/vue/1.0.0'

  it('fetches a text file and strips leading ./', async () => {
    getRegistryMock.mockResolvedValue({
      url: 'https://r.example.com',
      headers: { Authorization: 'Bearer T' }
    })
    http.getBuffer.mockResolvedValue(Buffer.from('body'))
    const text = await registry.fetchFile(registryUrl, './templates/a.vue')
    expect(http.getBuffer.mock.calls[0][0]).toBe(
      'https://r.example.com/registries/@rack/vue/1.0.0/files/templates/a.vue'
    )
    expect(text).toBe('body')
  })

  it('fetches a text file without ./ prefix', async () => {
    getRegistryMock.mockResolvedValue({ url: 'https://r.example.com' })
    http.getBuffer.mockResolvedValue(Buffer.from('body'))
    await registry.fetchFile(registryUrl, 'templates/a.vue')
    expect(http.getBuffer.mock.calls[0][0]).toBe(
      'https://r.example.com/registries/@rack/vue/1.0.0/files/templates/a.vue'
    )
  })

  it.each([
    ['../evil', 'leading ../'],
    ['./../evil', './ then ../'],
    ['a/../../evil', 'mid-path traversal'],
    ['%2e%2e/evil', 'percent not allowed'],
    ['a/%2e%2e/evil', 'percent not allowed'],
    ['/etc/passwd', 'absolute path'],
    ['templates\\..\\registry.json', 'backslash'],
    ['templates%5c..%5cregistry.json', 'percent not allowed'],
    ['templates%5C..%5Cregistry.json', 'percent not allowed'],
    ['templates/%ZZ/file.txt', 'percent not allowed'],
    ['templates/%2g/file.txt', 'percent not allowed'],
    ['templates/file%', 'percent not allowed'],
    ['templates/a?b.txt', 'query character'],
    ['templates/a#b.txt', 'fragment character']
  ])('rejects invalid file path: %s (%s)', async (path) => {
    await expect(registry.fetchFile(registryUrl, path)).rejects.toThrow(
      /Invalid file path/
    )
  })

  it('translates 404 into a descriptive template-not-found error', async () => {
    getRegistryMock.mockResolvedValue({ url: 'https://r.example.com' })
    http.getBuffer.mockRejectedValue(new HttpError('404', 404))
    await expect(registry.fetchFile(registryUrl, './x.ts')).rejects.toThrow(
      /Template file not found/
    )
  })

  it('passes through non-404 errors from file fetch', async () => {
    getRegistryMock.mockResolvedValue({ url: 'https://r.example.com' })
    http.getBuffer.mockRejectedValue(new HttpError('500', 500))
    await expect(
      registry.fetchFile(registryUrl, './x.ts')
    ).rejects.toMatchObject({ status: 500 })
  })

  it('passes no auth headers when registryUrl has no namespace segment', async () => {
    getRegistryMock.mockResolvedValue({ url: 'https://r.example.com' })
    http.getBuffer.mockResolvedValue(Buffer.from('body'))
    await registry.fetchFile('https://no-ns.example.com/foo/1.0.0', 'a')
    expect(http.getBuffer.mock.calls[0][1]).toEqual({ headers: undefined })
  })
})

describe('registry/client fetchBinaryFile', () => {
  const registryUrl = 'https://r.example.com/registries/@rack/vue/1.0.0'

  it('downloads a binary file via HTTP getBuffer', async () => {
    getRegistryMock.mockResolvedValue({
      url: 'https://r.example.com',
      headers: { Authorization: 'Bearer T' }
    })
    http.getBuffer.mockResolvedValue(Buffer.from([1, 2]))
    const buf = await registry.fetchBinaryFile(registryUrl, 'assets/logo.png')
    expect(Array.from(buf)).toEqual([1, 2])
    expect(http.getBuffer.mock.calls[0][0]).toBe(
      'https://r.example.com/registries/@rack/vue/1.0.0/files/assets/logo.png'
    )
  })

  it('translates 404 into a descriptive template-not-found error', async () => {
    getRegistryMock.mockResolvedValue({ url: 'https://r.example.com' })
    http.getBuffer.mockRejectedValue(new HttpError('404', 404))
    await expect(
      registry.fetchBinaryFile(registryUrl, 'a.png')
    ).rejects.toThrow(/Template file not found/)
  })
})

describe('registry/client fetchItems', () => {
  it('returns empty array for empty input', async () => {
    expect(await registry.fetchItems([])).toEqual([])
  })

  it('parallel-fetches items and skips failures with a warning', async () => {
    getRegistryMock.mockResolvedValue({ url: 'https://r.example.com' })
    http.get
      .mockResolvedValueOnce({ data: baseItem })
      .mockRejectedValueOnce(new HttpError('404', 404))
    const logger = createMockLogger()

    const items = await registry.fetchItems(
      ['@rack/vue@1.0.0', '@rack/missing@1.0.0'],
      { logger }
    )
    expect(items.length).toBe(1)
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Could not fetch registry @rack/missing@1.0.0')
    )
  })

  it('silently skips failures when no logger is provided', async () => {
    getRegistryMock.mockResolvedValue({ url: 'https://r.example.com' })
    http.get.mockRejectedValue(new HttpError('404', 404))
    const items = await registry.fetchItems(['@rack/missing@1.0.0'])
    expect(items).toEqual([])
  })
})
