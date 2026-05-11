import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest'

describe('bin entry point', () => {
  const originalArgv = process.argv

  beforeEach(() => {
    vi.resetModules()
    process.argv = ['node', 'rk', '--help']
  })

  afterEach(() => {
    process.argv = originalArgv
    vi.restoreAllMocks()
  })

  it('prints fatal error and exits with code 1 when main rejects', async () => {
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never)

    vi.doMock('../src/cli.js', () => ({
      main: vi.fn().mockRejectedValue(new Error('boom'))
    }))

    await import('../src/bin.js')
    await new Promise((r) => setTimeout(r, 10))

    expect(errorSpy).toHaveBeenCalledWith('Fatal error:', 'boom')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})
