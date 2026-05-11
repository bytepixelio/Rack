/**
 * Storage integrity guard.
 *
 * Validates that:
 *  1. The real `packages/storage/schema/registry-item.json` compiles with
 *     the Ajv draft-2020 dialect + `ajv-formats`.
 *  2. Every `registry.json` shipped under `packages/storage/@*` passes
 *     that real schema.
 *
 * This catches drift between the server's validator, the schema, and the
 * sample data — which unit tests with fake schemas miss entirely.
 */

import Ajv from 'ajv/dist/2020.js'
import { fileURLToPath } from 'url'
import addFormats from 'ajv-formats'
import { it, expect, describe } from 'vitest'
import { join, dirname, resolve } from 'path'
import { readdir, readFile } from 'fs/promises'

const storageDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'packages',
  'storage'
)

async function findRegistryJsons(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) return findRegistryJsons(full)
      if (entry.isFile() && entry.name === 'registry.json') return [full]
      return []
    })
  )
  return nested.flat()
}

describe('storage integrity', () => {
  it('real schema compiles with draft 2020-12 + formats', async () => {
    const ajv = new Ajv({ allErrors: true })
    addFormats(ajv)
    const schema = JSON.parse(
      await readFile(
        resolve(storageDir, 'schema', 'registry-item.json'),
        'utf-8'
      )
    )
    expect(() => ajv.compile(schema)).not.toThrow()
  })

  it('every shipped registry.json conforms to the real schema', async () => {
    const ajv = new Ajv({ allErrors: true })
    addFormats(ajv)
    const schema = JSON.parse(
      await readFile(
        resolve(storageDir, 'schema', 'registry-item.json'),
        'utf-8'
      )
    )
    const validate = ajv.compile(schema)

    const files = await findRegistryJsons(resolve(storageDir, '@rack'))
    expect(files.length).toBeGreaterThan(0)

    const failures: { file: string; errors: unknown }[] = []
    for (const file of files) {
      const data = JSON.parse(await readFile(file, 'utf-8'))
      if (!validate(data)) {
        failures.push({ file, errors: validate.errors })
      }
    }

    expect(failures).toEqual([])
  })
})
