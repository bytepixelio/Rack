/**
 * Upload service for registry package publishing.
 *
 * Orchestrates the upload pipeline:
 * 1. Save uploaded stream to temp file
 * 2. Verify SHA256 checksum
 * 3. Extract tar.gz
 * 4. Parse and validate registry.json
 * 5. Atomic install to final location
 * 6. Update versions.json
 * 7. Emit webhook events
 */

import { createGunzip } from 'zlib'
import { join, dirname } from 'path'
import { pipeline } from 'stream/promises'
import { extract as tarExtract } from 'tar'
import { createHash, randomUUID } from 'crypto'
import { deriveSegments } from '@rack/registry-core'
import { createReadStream, createWriteStream } from 'fs'
import { ALLOWED_UPLOAD_MIMETYPES } from '../constants.js'
import {
  ConflictError,
  ForbiddenError,
  ValidationError
} from '../lib/errors.js'

import type { Readable } from 'stream'
import type { FastifyBaseLogger } from 'fastify'
import type { AuthService } from './auth.service.js'
import type { WebhookService } from './webhook.service.js'
import type { StorageService } from './storage.service.js'
import type { R2UploadBackend } from './r2-upload-backend.js'
import type { SchemaValidatorService } from './schema-validator.service.js'

export class UploadService {
  private readonly auth: AuthService
  private readonly storageRoot: string
  private readonly r2?: R2UploadBackend
  private readonly storage: StorageService
  private readonly webhook: WebhookService
  private readonly logger: FastifyBaseLogger
  private readonly validator: SchemaValidatorService

  /**
   * Create a new UploadService.
   *
   * @param storageRoot - Absolute path to the storage root
   * @param auth - AuthService instance (namespace whitelist source)
   * @param storage - StorageService instance
   * @param validator - SchemaValidatorService instance
   * @param webhook - WebhookService instance
   * @param logger - Logger instance
   * @param r2 - R2 upload backend (optional, enables R2 storage)
   */
  constructor(
    storageRoot: string,
    auth: AuthService,
    storage: StorageService,
    validator: SchemaValidatorService,
    webhook: WebhookService,
    logger: FastifyBaseLogger,
    r2?: R2UploadBackend
  ) {
    this.r2 = r2
    this.auth = auth
    this.logger = logger
    this.storage = storage
    this.webhook = webhook
    this.validator = validator
    this.storageRoot = storageRoot
  }

  /**
   * Check if a MIME type is acceptable for upload.
   *
   * @param mimetype - MIME type string
   * @returns `true` if allowed
   */
  isValidMimeType(mimetype: string): boolean {
    return ALLOWED_UPLOAD_MIMETYPES.has(mimetype)
  }

  /**
   * Save an upload stream to a temporary file.
   *
   * @param stream - Readable stream from multipart upload
   * @returns Path to the saved temp file
   */
  async saveToTemp(stream: Readable): Promise<string> {
    const tempDir = join(this.storageRoot, '.tmp')
    await this.storage.mkdirp(tempDir)

    const tempPath = join(tempDir, `upload-${randomUUID()}.tar.gz`)
    await pipeline(stream, createWriteStream(tempPath))

    this.logger.info({ tempPath }, 'File saved to temp')
    return tempPath
  }

  /**
   * Verify a file's SHA256 checksum.
   *
   * @param filePath - Path to the file
   * @param expected - Expected hex digest
   * @throws {ValidationError} On mismatch
   */
  async verifyChecksum(filePath: string, expected: string): Promise<void> {
    const hash = createHash('sha256')

    for await (const chunk of createReadStream(filePath)) {
      hash.update(chunk)
    }

    if (hash.digest('hex') !== expected) {
      throw new ValidationError(
        'CHECKSUM_MISMATCH',
        'Checksum verification failed'
      )
    }

    this.logger.info('Checksum verified')
  }

  /**
   * Extract a tar.gz archive to a temp directory.
   *
   * @param tarPath - Path to the tar.gz file
   * @returns Path to the extraction directory
   */
  async extractTarGz(tarPath: string): Promise<string> {
    const extractDir = join(this.storageRoot, '.tmp', `extract-${randomUUID()}`)
    await this.storage.mkdirp(extractDir)

    await pipeline(
      createReadStream(tarPath),
      createGunzip(),
      tarExtract({ cwd: extractDir, strict: true })
    )

    this.logger.info({ extractDir }, 'Package extracted')
    return extractDir
  }

  /**
   * Parse namespace, name, version, and storage segments from an extracted
   * package.
   *
   * `segments` is the path under `<namespace>/` where the module installs
   * (and is later read from). Resolution order:
   *
   * 1. Explicit `path` field in registry.json — split on `/`. The last
   *    segment must equal `name`.
   * 2. `CATEGORY_BY_TYPE[type]` exists → `[category, name]` (e.g.
   *    `registry:quality` → `["quality", "husky"]`).
   * 3. Fallback → `[name]` (flat layout, matches the legacy behavior).
   *
   * @param extractedDir - Path to the extracted package
   * @returns Parsed metadata + install segments
   * @throws {ValidationError} On missing fields or path/name mismatch
   */
  async parsePackageInfo(extractedDir: string): Promise<{
    name: string
    version: string
    namespace: string
    segments: string[]
  }> {
    let raw: string
    try {
      raw = await this.storage.readFile(join(extractedDir, 'registry.json'))
    } catch {
      throw new ValidationError(
        'UPLOAD_FAILED',
        'registry.json not found in package'
      )
    }

    let data: Record<string, unknown>
    try {
      data = JSON.parse(raw) as Record<string, unknown>
    } catch {
      throw new ValidationError(
        'UPLOAD_FAILED',
        'registry.json is not valid JSON'
      )
    }

    for (const field of ['namespace', 'name', 'version'] as const) {
      const value = data[field]
      if (typeof value !== 'string' || value.length === 0) {
        throw new ValidationError(
          'UPLOAD_FAILED',
          `${field} is required in registry.json`
        )
      }
    }

    const namespace = data.namespace as string
    const name = data.name as string
    const version = data.version as string
    const type = typeof data.type === 'string' ? data.type : undefined
    const explicitPath = typeof data.path === 'string' ? data.path : undefined

    let segments: string[]
    try {
      segments = deriveSegments({ name, type, path: explicitPath })
    } catch (err) {
      throw new ValidationError('UPLOAD_FAILED', (err as Error).message)
    }

    this.logger.info(
      { name, version, segments, namespace },
      'Package info parsed'
    )

    return { name, version, segments, namespace }
  }

  /**
   * Assert that a namespace is declared in auth.json.
   *
   * @param namespace - Namespace to check
   * @throws {ForbiddenError} When not allowed
   */
  validateNamespace(namespace: string): void {
    if (!this.auth.isNamespaceAllowed(namespace)) {
      throw new ForbiddenError(
        'NAMESPACE_NOT_ALLOWED',
        `Namespace ${namespace} is not allowed`
      )
    }
  }

  /**
   * Validate an extracted package's registry.json against the schema.
   *
   * @param extractedDir - Path to the extracted package
   * @throws {Error} On validation failure
   */
  async validateSchema(extractedDir: string): Promise<void> {
    const raw = await this.storage.readFile(join(extractedDir, 'registry.json'))
    await this.validator.validate(JSON.parse(raw))
    this.logger.info('Schema validation passed')
  }

  /**
   * Install a package to its final storage location.
   *
   * When R2 backend is configured, uploads files to R2.
   * Otherwise, atomically renames the extracted directory on local disk.
   * In both cases, regenerates versions.json afterward.
   *
   * `segments` is the path under `<namespace>/` (e.g. `["quality", "husky"]`).
   * Callers obtain it from {@link parsePackageInfo}.
   *
   * @param extractedDir - Path to the extracted package
   * @param namespace - e.g. `@rack`
   * @param name - Leaf identifier (used in error messages and webhook payload)
   * @param version - e.g. `1.0.0`
   * @param segments - Storage segments under namespace
   * @throws {ConflictError} When the version already exists
   */
  async install(
    extractedDir: string,
    namespace: string,
    name: string,
    version: string,
    segments: string[]
  ): Promise<void> {
    if (this.r2) {
      await this.installToR2(extractedDir, namespace, version, segments)
    } else {
      await this.installToLocal(extractedDir, namespace, version, segments)
    }

    await this.regenerateVersions(namespace, name, version, segments)
  }

  /** Install to local filesystem via atomic rename. */
  private async installToLocal(
    extractedDir: string,
    namespace: string,
    version: string,
    segments: string[]
  ): Promise<void> {
    const targetDir = join(this.storageRoot, namespace, ...segments, version)

    if (await this.storage.exists(targetDir)) {
      throw new ConflictError(
        'VERSION_EXISTS',
        `Registry ${namespace}/${segments.join('/')}@${version} already exists`
      )
    }

    await this.storage.mkdirp(dirname(targetDir))
    await this.storage.rename(extractedDir, targetDir)
    this.logger.info({ targetDir }, 'Package installed to local')
  }

  /** Install to R2 by uploading all extracted files. */
  private async installToR2(
    extractedDir: string,
    namespace: string,
    version: string,
    segments: string[]
  ): Promise<void> {
    const keyPrefix = `${namespace}/${segments.join('/')}/${version}`

    if (await this.r2!.exists(`${keyPrefix}/registry.json`)) {
      throw new ConflictError(
        'VERSION_EXISTS',
        `Registry ${namespace}/${segments.join('/')}@${version} already exists`
      )
    }

    await this.r2!.uploadDirectory(extractedDir, keyPrefix)
    this.logger.info({ keyPrefix }, 'Package installed to R2')
  }

  /**
   * Emit webhook events after a successful upload.
   *
   * Fires `uploaded` and `version.created` events. `segments` is
   * threaded into the payload so subscribers can rebuild the
   * canonical URL (e.g. `@rack/quality/husky/1.0.0`) — single-leaf
   * `name` alone would lose the category prefix.
   *
   * Errors are logged but do not propagate.
   */
  emitEvents(
    namespace: string,
    name: string,
    version: string,
    segments: string[]
  ): void {
    try {
      const data = { name, version, segments, namespace }
      this.webhook.emitEvent('uploaded', data)
      this.webhook.emitEvent('version.created', data)
      this.logger.info(
        { name, version, segments, namespace },
        'Webhook events emitted'
      )
    } catch (error) {
      this.logger.warn({ error }, 'Failed to emit webhook events')
    }
  }

  /**
   * Remove temporary files, ignoring errors.
   *
   * @param paths - Paths to clean up (undefined values are skipped)
   */
  async cleanup(...paths: (string | undefined)[]): Promise<void> {
    for (const p of paths) {
      if (!p) continue
      await this.storage
        .remove(p, { recursive: true, force: true })
        .catch((error) =>
          this.logger.warn({ error, path: p }, 'Cleanup failed')
        )
    }
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  /** Rebuild versions.json after a new version is installed. */
  private async regenerateVersions(
    namespace: string,
    name: string,
    version: string,
    segments: string[]
  ): Promise<void> {
    try {
      if (this.r2) {
        await this.regenerateVersionsR2(namespace, name, version, segments)
      } else {
        await this.regenerateVersionsLocal(namespace, name, version, segments)
      }
    } catch (error) {
      this.logger.warn(
        { name, error, namespace },
        'Failed to regenerate versions.json'
      )
    }
  }

  private async regenerateVersionsLocal(
    namespace: string,
    name: string,
    version: string,
    segments: string[]
  ): Promise<void> {
    const registryDir = join(this.storageRoot, namespace, ...segments)
    const found = await this.storage.findVersions(registryDir)
    const all = Array.from(new Set([version, ...found]))
    const sorted = this.storage.sortVersionsDescending(all)

    await this.storage.writeFile(
      join(registryDir, 'versions.json'),
      JSON.stringify({ versions: sorted }, null, 2) + '\n'
    )

    this.logger.info(
      { name, namespace, versions: sorted },
      'versions.json regenerated (local)'
    )
  }

  private async regenerateVersionsR2(
    namespace: string,
    name: string,
    version: string,
    segments: string[]
  ): Promise<void> {
    const registryPrefix = `${namespace}/${segments.join('/')}`
    const found = await this.r2!.findVersions(registryPrefix)
    const all = Array.from(new Set([version, ...found]))
    const sorted = this.storage.sortVersionsDescending(all)

    await this.r2!.writeFile(
      `${registryPrefix}/versions.json`,
      JSON.stringify({ versions: sorted }, null, 2) + '\n'
    )

    this.logger.info(
      { name, namespace, versions: sorted },
      'versions.json regenerated (R2)'
    )
  }
}
