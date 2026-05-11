import { runCli } from '../src/cli.js'
import { startServer } from '../src/server.js'
import { createWorkspace } from '../src/workspace.js'
import { it, expect, afterAll, describe, beforeAll } from 'vitest'

import type { TestServer } from '../src/server.js'

// Per-error-code semantics are unit-tested in apps/cli. This e2e only
// verifies the user-facing wiring: a failing command exits non-zero and
// renders a `Hint:` line through the formatter.

describe('rk surfaces errors with non-zero exit and a Hint line', () => {
  let server: TestServer

  beforeAll(async () => {
    server = await startServer()
  })

  afterAll(async () => {
    await server.close()
  })

  it('unknown registry → non-zero exit with formatted hint', async () => {
    const ws = await createWorkspace(server.url)
    try {
      const result = await runCli(['add', '@rack/does-not-exist'], {
        cwd: ws.cwd,
        home: ws.home
      })

      expect(result.exitCode).not.toBe(0)
      expect(result.stderr + result.stdout).toContain('Hint:')
    } finally {
      await ws.cleanup()
    }
  })
})
