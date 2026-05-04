import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('cli main', () => {
  const originalArgv = process.argv

  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
  })

  afterEach(() => {
    process.argv = originalArgv
    vi.restoreAllMocks()
  })

  it('assembles the program and parses argv to completion', async () => {
    process.argv = ['node', 'rk', 'version']
    const { main } = await import('../src/cli.js')
    await expect(main()).resolves.toBeUndefined()
  })
})
