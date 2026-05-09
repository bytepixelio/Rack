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
import { lstat, readdir } from 'fs/promises'
import { pipeline } from 'stream/promises'
import { extract as tarExtract } from 'tar'
import { join, dirname, relative, sep } from 'path'
import { createHash, randomUUID } from 'crypto'
import { validateFilePath, deriveSegments } from '@rack/registry-core'
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
   * Validate that every `files[].path` in the manifest is a legal path
   * and points to an existing regular file in the extracted directory.
   *
   * @param extractedDir - Path to the extracted package
   * @throws {ValidationError} If any path is invalid or missing
   */
  async validateFilePaths(extractedDir: string): Promise<void> {
    const manifest = await this.readManifest(extractedDir)
    const paths = collectManifestPaths(manifest)

    for (const filePath of paths) {
      const { normalized } = validateFilePath(filePath)
      const fullPath = join(extractedDir, normalized)

      if (!await this.storage.isFile(fullPath)) {
        throw new ValidationError(
          'FILE_NOT_FOUND',
          `File referenced in registry.json is missing or not a regular file: ${filePath}`
        )
      }
    }

    this.logger.info({ count: paths.length }, 'File path validation passed')
  }

  /**
   * Walk the extracted package tree and reject:
   *
   * 1. Any non-regular, non-directory entry (symlink, hardlink, FIFO,
   *    socket, device file). Tar's `strict: true` blocks most exotic
   *    entry types, but this is a defense-in-depth check on the
   *    actual filesystem state after extraction.
   * 2. Any regular file that is not declared in the manifest's
   *    allowlist (`registry.json` + `files[].path` +
   *    `languages.*.files[].path` + custom `mergeStrategy.script`).
   *
   * Without this check, `installToLocal` (`rename` of the whole dir)
   * and `installToR2` (`walkDirectory` + upload) would propagate any
   * stowaway file into final storage where it could be served via
   * `/files/*` or have its symlink target leaked.
   *
   * @param extractedDir - Path to the extracted package
   * @throws {ValidationError} On unsafe entries or undeclared files
   */
  async validateExtractedTree(extractedDir: string): Promise<void> {
    const manifest = await this.readManifest(extractedDir)
    const allowlist = buildAllowlist(manifest)

    let fileCount = 0

    const walk = async (dir: string): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        const abs = join(dir, entry.name)

        // 1. Reject non-regular, non-directory entries via lstat (no follow).
        //    Dirent.is* on some platforms reflects the resolved type, so
        //    re-stat to be sure.
        const stats = await lstat(abs)
        if (!stats.isFile() && !stats.isDirectory()) {
          throw new ValidationError(
            'UNSAFE_FILE',
            `Package contains an unsupported entry type at ${this.relPath(extractedDir, abs)} ` +
              '(only regular files and directories are allowed)'
          )
        }

        if (stats.isDirectory()) {
          await walk(abs)
          continue
        }

        // 2. Reject regular files not declared in manifest allowlist.
        const rel = this.relPath(extractedDir, abs)
        if (!allowlist.has(rel)) {
          throw new ValidationError(
            'UNDECLARED_FILE',
            `Package contains a file not declared in registry.json: ${rel}`
          )
        }

        fileCount++
      }
    }

    await walk(extractedDir)

    this.logger.info(
      { count: fileCount, allowlistSize: allowlist.size },
      'Extracted tree validation passed'
    )
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

  /** Read and parse the extracted package's `registry.json`. */
  private async readManifest(extractedDir: string): Promise<ManifestShape> {
    const raw = await this.storage.readFile(join(extractedDir, 'registry.json'))
    return JSON.parse(raw) as ManifestShape
  }

  /** POSIX-style relative path from `extractedDir` to `abs`. */
  private relPath(extractedDir: string, abs: string): string {
    return relative(extractedDir, abs).split(sep).join('/')
  }

  /** Rebuild versions.json after a new version is installed. */
  private async regenerateVersions(
    namespace: string,
    name: string,
    version: string,
    segments: string[]
  ): Promise<void> {
    if (this.r2) {
      await this.regenerateVersionsR2(namespace, name, version, segments)
    } else {
      await this.regenerateVersionsLocal(namespace, name, version, segments)
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Minimal shape of `registry.json` needed for upload-time validation. */
interface ManifestFile {
  path?: string
  mergeStrategy?: { type?: string; script?: string }
}

interface ManifestShape {
  files?: ManifestFile[]
  languages?: Record<string, { files?: ManifestFile[] }>
}

/**
 * Collect every file path declared in the manifest:
 *
 * - `files[].path`
 * - `languages.*.files[].path`
 * - `files[].mergeStrategy.script` (when `type === 'custom'`)
 * - `languages.*.files[].mergeStrategy.script` (when `type === 'custom'`)
 */
function collectManifestPaths(manifest: ManifestShape): string[] {
  const paths: string[] = []

  const collectFrom = (files: ManifestFile[] | undefined): void => {
    if (!files) return
    for (const f of files) {
      if (f.path) paths.push(f.path)
      if (f.mergeStrategy?.type === 'custom' && f.mergeStrategy.script) {
        paths.push(f.mergeStrategy.script)
      }
    }
  }

  collectFrom(manifest.files)
  if (manifest.languages) {
    for (const lang of Object.values(manifest.languages)) {
      collectFrom(lang.files)
    }
  }

  return paths
}

/**
 * Build the allowlist of POSIX-relative file paths that may appear in
 * the extracted package. Always includes `registry.json`. Manifest paths
 * are normalized via {@link validateFilePath} so an entry like `./a/b`
 * matches a tree file at `a/b`.
 */
function buildAllowlist(manifest: ManifestShape): Set<string> {
  const allow = new Set<string>(['registry.json'])
  for (const p of collectManifestPaths(manifest)) {
    try {
      const { normalized } = validateFilePath(p)
      allow.add(normalized)
    } catch {
      // Invalid path will fail in validateFilePaths with a descriptive error;
      // skip here so this helper never throws mid-walk.
    }
  }
  return allow
}
