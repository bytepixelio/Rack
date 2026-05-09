/**
 * Schema validation service with lazy loading and caching.
 *
 * Compiles the `registry-item.json` JSON Schema into an AJV validator
 * on first use and caches it for subsequent calls.
 */

import { join } from 'path'
import Ajv from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { readFile } from 'fs/promises'
import { ValidationError } from '../lib/errors.js'

import type { ValidateFunction } from 'ajv'

export class SchemaValidatorService {
  private readonly ajv: Ajv
  private readonly schemaPath: string

  private cached: ValidateFunction | null = null
  private loading: Promise<ValidateFunction> | null = null

  /**
   * Create a new SchemaValidatorService.
   *
   * @param schemaDir - Absolute path to the directory holding schema files
   */
  constructor(schemaDir: string) {
    this.ajv = new Ajv({ allErrors: true })
    addFormats(this.ajv)
    this.schemaPath = join(schemaDir, 'registry-item.json')
  }

  /**
   * Validate data against the registry-item schema.
   *
   * Lazily loads and caches the validator on first call. Schema
   * mismatches are user input errors (a bad `registry.json` in the
   * uploaded package), so they surface as `ValidationError` (400) —
   * not the generic `Error` that would default to 500 in the global
   * error handler. Schema-loading failures are still 500 because they
   * indicate a misconfigured server.
   *
   * @param data - Parsed JSON object to validate
   * @throws {ValidationError} On schema mismatch (400)
   * @throws {Error} On schema-loading or compilation failure (500)
   *
   * @example
   * await validator.validate({ name: '@rack/node', version: '1.0.0', ... })
   */
  async validate(data: unknown): Promise<void> {
    const fn = await this.getValidator()

    if (!fn(data)) {
      throw new ValidationError(
        'SCHEMA_VALIDATION_FAILED',
        `Schema validation failed: ${JSON.stringify(fn.errors)}`
      )
    }
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  /** Get or create the cached validator, deduplicating concurrent loads. */
  private async getValidator(): Promise<ValidateFunction> {
    if (this.cached) return this.cached
    if (this.loading) return this.loading

    this.loading = this.compile()

    try {
      this.cached = await this.loading
      return this.cached
    } catch (error) {
      this.loading = null
      throw new Error(`Failed to load schema: ${this.schemaPath}`, {
        cause: error
      })
    }
  }

  /** Read and compile the schema file. */
  private async compile(): Promise<ValidateFunction> {
    const raw = await readFile(this.schemaPath, 'utf-8')
    return this.ajv.compile(JSON.parse(raw))
  }
}
