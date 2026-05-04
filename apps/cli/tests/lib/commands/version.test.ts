import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../../src/lib/utils/version.js', () => ({
  getCliVersion: vi.fn().mockResolvedValue('9.9.9')
}))

import { registerVersionCommand } from '../../../src/lib/commands/version/index.js'
import { runCommand } from './helpers.js'

let infoSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
})
afterEach(() => vi.restoreAllMocks())

describe('version command', () => {
  it('prints CLI version, Node version, platform and config path', async () => {
    await runCommand(registerVersionCommand, ['version'])
    const out = infoSpy.mock.calls.flat().join('\n')
    expect(out).toContain('9.9.9')
    expect(out).toContain(process.version)
    expect(out).toContain(process.platform)
    expect(out).toContain('.rackrc')
  })
})
