/**
 * Temporary-directory helper for tests that touch the real filesystem.
 */

import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { rm, mkdir } from 'node:fs/promises'

export async function makeTmpDir(prefix = 'rack-test'): Promise<string> {
  const dir = join(tmpdir(), `${prefix}-${randomUUID()}`)
  await mkdir(dir, { recursive: true })
  return dir
}

export async function cleanTmpDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true })
}
