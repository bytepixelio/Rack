import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../../../src/lib/rackrc.js', () => ({
  rackrc: { load: vi.fn() }
}))

import {
  validateNamespace,
  checkRegistryExists,
  displayRegistryEntry
} from '../../../../src/lib/commands/config/helpers.js'
import { rackrc } from '../../../../src/lib/rackrc.js'

const loadMock = rackrc.load as unknown as ReturnType<typeof vi.fn>

beforeEach(() => loadMock.mockReset())
afterEach(() => vi.restoreAllMocks())

describe('config/helpers', () => {
  it('validateNamespace accepts names starting with @', () => {
    expect(() => validateNamespace('@ok')).not.toThrow()
  })

  it('validateNamespace throws for names without @ prefix', () => {
    expect(() => validateNamespace('nope')).toThrow(/Invalid namespace/)
  })

  it('checkRegistryExists returns the entry when found', async () => {
    loadMock.mockResolvedValue({
      registries: { '@acme': 'https://a.com' }
    })
    expect(await checkRegistryExists('@acme')).toBe('https://a.com')
  })

  it('checkRegistryExists throws when the namespace is not configured', async () => {
    loadMock.mockResolvedValue({ registries: {} })
    await expect(checkRegistryExists('@missing')).rejects.toThrow(/not found/)
  })

  it('displayRegistryEntry prints URL when no headers are present', () => {
    const info = vi.fn()
    vi.spyOn(console, 'info').mockImplementation(info)
    displayRegistryEntry('@acme', { url: 'https://a.com' })
    expect(info).toHaveBeenCalled()
  })

  it('displayRegistryEntry prints headers when provided', () => {
    const info = vi.fn()
    vi.spyOn(console, 'info').mockImplementation(info)
    displayRegistryEntry('@acme', {
      url: 'https://a.com',
      headers: { Authorization: 'Bearer T' }
    })
    const calls = info.mock.calls.flat().join(' ')
    expect(calls).toContain('Authorization')
  })
})
