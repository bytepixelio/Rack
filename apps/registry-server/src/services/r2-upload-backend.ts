/**
 * R2 upload backend for registry package publishing.
 *
 * Handles uploading extracted package files to Cloudflare R2
 * and managing versions.json in the bucket.
 */

import { join } from 'path'
import { SEMVER_PATTERN } from '@rack/registry-core'
import { readdir, readFile } from 'fs/promises'
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command
} from '@aws-sdk/client-s3'

import type { FastifyBaseLogger } from 'fastify'

export interface R2Config {
  accountId: string
  bucketName: string
  accessKeyId: string
  secretAccessKey: string
}

export class R2UploadBackend {
  private readonly client: S3Client
  private readonly bucketName: string
  private readonly logger: FastifyBaseLogger

  constructor(config: R2Config, logger: FastifyBaseLogger) {
    this.logger = logger
    this.bucketName = config.bucketName
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      }
    })
  }

  /**
   * Check whether a key exists in the bucket.
   */
  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucketName, Key: key })
      )
      return true
    } catch {
      return false
    }
  }

  /**
   * Upload all files from a local directory to R2.
   *
   * Recursively walks the directory and uploads each file
   * with its relative path as the R2 key prefix.
   *
   * @param localDir - Local directory containing extracted files
   * @param keyPrefix - R2 key prefix (e.g. `@rack/node/1.0.0`)
   */
  async uploadDirectory(localDir: string, keyPrefix: string): Promise<void> {
    const files = await this.walkDirectory(localDir)

    for (const filePath of files) {
      const relativePath = filePath.slice(localDir.length + 1)
      const key = `${keyPrefix}/${relativePath}`
      const body = await readFile(filePath)

      await this.client.send(
        new PutObjectCommand({ Bucket: this.bucketName, Key: key, Body: body })
      )

      this.logger.debug({ key }, 'Uploaded file to R2')
    }

    this.logger.info(
      { keyPrefix, fileCount: files.length },
      'Directory uploaded to R2'
    )
  }

  /**
   * Write a string as an object in R2.
   */
  async writeFile(key: string, content: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Key: key,
        Body: content,
        Bucket: this.bucketName,
        ContentType: 'application/json'
      })
    )
  }

  /**
   * Find all SemVer version prefixes for a registry in R2.
   *
   * Uses ListObjectsV2 with delimiter to simulate directory listing.
   *
   * @param registryPrefix - e.g. `@rack/node/`
   * @returns List of version strings
   */
  async findVersions(registryPrefix: string): Promise<string[]> {
    const prefix = registryPrefix.endsWith('/')
      ? registryPrefix
      : `${registryPrefix}/`

    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
        Delimiter: '/'
      })
    )

    const versions: string[] = []

    for (const cp of response.CommonPrefixes ?? []) {
      if (!cp.Prefix) continue
      const name = cp.Prefix.slice(prefix.length).replace(/\/$/, '')
      if (SEMVER_PATTERN.test(name)) versions.push(name)
    }

    return versions
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  /** Recursively list all files in a local directory. */
  private async walkDirectory(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true })
    const files: string[] = []

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        files.push(...(await this.walkDirectory(fullPath)))
      } else {
        files.push(fullPath)
      }
    }

    return files
  }
}
