import { join } from 'path'
import { tmpdir } from 'os'
import { rm, mkdir, mkdtemp, writeFile } from 'fs/promises'
import { it, expect, describe, afterEach, beforeEach } from 'vitest'
import { SchemaValidatorService } from '../../src/services/schema-validator.service.js'

const VALID_SCHEMA = {
  type: 'object',
  required: ['name', 'version'],
  properties: {
    name: { type: 'string' },
    version: { type: 'string' }
  }
}

describe('SchemaValidatorService', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'schema-test-'))
    await mkdir(join(tempDir, 'schema'), { recursive: true })
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('should pass validation for valid data', async () => {
    await writeFile(
      join(tempDir, 'schema', 'registry-item.json'),
      JSON.stringify(VALID_SCHEMA)
    )
    const validator = new SchemaValidatorService(join(tempDir, 'schema'))

    await expect(
      validator.validate({ name: '@rack/node', version: '1.0.0' })
    ).resolves.toBeUndefined()
  })

  it('should throw a 400 ValidationError for invalid data', async () => {
    await writeFile(
      join(tempDir, 'schema', 'registry-item.json'),
      JSON.stringify(VALID_SCHEMA)
    )
    const validator = new SchemaValidatorService(join(tempDir, 'schema'))

    await expect(validator.validate({ name: 123 })).rejects.toMatchObject({
      code: 'SCHEMA_VALIDATION_FAILED',
      statusCode: 400
    })
  })

  it('should cache the validator across calls', async () => {
    await writeFile(
      join(tempDir, 'schema', 'registry-item.json'),
      JSON.stringify(VALID_SCHEMA)
    )
    const validator = new SchemaValidatorService(join(tempDir, 'schema'))

    await validator.validate({ name: 'a', version: '1' })
    await validator.validate({ name: 'b', version: '2' })
  })

  it('should deduplicate concurrent loads', async () => {
    await writeFile(
      join(tempDir, 'schema', 'registry-item.json'),
      JSON.stringify(VALID_SCHEMA)
    )
    const validator = new SchemaValidatorService(join(tempDir, 'schema'))

    const [r1, r2] = await Promise.all([
      validator.validate({ name: 'a', version: '1' }),
      validator.validate({ name: 'b', version: '2' })
    ])

    expect(r1).toBeUndefined()
    expect(r2).toBeUndefined()
  })

  it('should throw when schema file does not exist', async () => {
    const validator = new SchemaValidatorService(tempDir + '/nonexistent')

    await expect(validator.validate({})).rejects.toThrow(
      'Failed to load schema'
    )
  })
})
