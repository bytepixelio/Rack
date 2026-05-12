/**
 * Discovery layer unit tests.
 *
 * Locks `discoverRegistries` to the protocol's SemVer rule (§6.11):
 * `+build.metadata` versions are valid in the schema, the server, and
 * `@rack/registry-core` — they must also be valid here, or e2e silently
 * drops legitimate official materials from the install matrix.
 */

import path from 'node:path'
import { tmpdir } from 'node:os'
import { discoverRegistries } from '../src/discover.js'
import { rm, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { it, expect, afterEach, describe, beforeEach } from 'vitest'

let storageRoot: string

beforeEach(async () => {
  storageRoot = await mkdtemp(path.join(tmpdir(), 'rack-e2e-discover-'))
})

afterEach(async () => {
  await rm(storageRoot, { recursive: true, force: true })
})

async function seedRegistry(
  rel: string,
  body: Record<string, unknown> = { name: 'demo', version: '1.0.0' }
): Promise<void> {
  const dir = path.join(storageRoot, rel)
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'registry.json'), JSON.stringify(body), 'utf8')
}

describe('discover/discoverRegistries SemVer rules', () => {
  it('discovers a plain semver version directory', async () => {
    await seedRegistry('@rack/lib/1.0.0')

    const out = await discoverRegistries(storageRoot)
    expect(out.map((m) => `${m.id}@${m.version}`)).toEqual(['@rack/lib@1.0.0'])
  })

  it('discovers a prerelease version directory', async () => {
    await seedRegistry('@rack/lib/2.0.0-rc.1')

    const out = await discoverRegistries(storageRoot)
    expect(out.map((m) => `${m.id}@${m.version}`)).toEqual([
      '@rack/lib@2.0.0-rc.1'
    ])
  })

  it('discovers a version directory carrying +build metadata', async () => {
    // Previously the private regex `/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/`
    // rejected `+build.42`, so the directory was treated as a path
    // segment and never produced a Material — see §6.11.
    await seedRegistry('@rack/lib/1.0.0+build.42')

    const out = await discoverRegistries(storageRoot)
    expect(out.map((m) => `${m.id}@${m.version}`)).toEqual([
      '@rack/lib@1.0.0+build.42'
    ])
  })

  it('keeps treating non-semver directories as path segments', async () => {
    await seedRegistry('@rack/quality/eslint/1.0.0')

    const out = await discoverRegistries(storageRoot)
    expect(out.map((m) => m.id)).toEqual(['@rack/quality/eslint'])
    expect(out[0].path).toBe('quality/eslint')
  })
})
