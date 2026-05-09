/**
 * R2 upload backend for registry package publishing.
 *
 * Handles uploading extracted package files to Cloudflare R2
 * and managing versions.json in the bucket.
 */

import { join } from 'path'
import { readdir, readFile } from 'fs/promises'
import { SEMVER_PATTERN } from '@rack/registry-core'
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
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
   * Order is **template files first, `registry.json` last**, so the
   * presence of `registry.json` at the destination prefix can be used
   * as a publish marker by callers (`exists("<prefix>/registry.json")`
   * implies a complete install). If any earlier upload fails, the
   * caller is expected to invoke {@link deletePrefix} to roll back —
   * `registry.json` will not have been written, so the version stays
   * invisible to readers and a retry will not collide with
   * `VERSION_EXISTS`.
   *
   * @param localDir - Local directory containing extracted files
   * @param keyPrefix - R2 key prefix (e.g. `@rack/node/1.0.0`)
   */
  async uploadDirectory(localDir: string, keyPrefix: string): Promise<void> {
    const files = await this.walkDirectory(localDir)

    const manifestPath = files.find(
      (p) => p.slice(localDir.length + 1) === 'registry.json'
    )
    const others = manifestPath
      ? files.filter((p) => p !== manifestPath)
      : files

    for (const filePath of others) {
      await this.putLocalFile(filePath, localDir, keyPrefix)
    }
    if (manifestPath) {
      await this.putLocalFile(manifestPath, localDir, keyPrefix)
    }

    this.logger.info(
      { keyPrefix, fileCount: files.length },
      'Directory uploaded to R2'
    )
  }

  /** Upload a single local file, preserving its relative path under `keyPrefix`. */
  private async putLocalFile(
    filePath: string,
    localDir: string,
    keyPrefix: string
  ): Promise<void> {
    const relativePath = filePath.slice(localDir.length + 1)
    const key = `${keyPrefix}/${relativePath}`
    const body = await readFile(filePath)

    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucketName, Key: key, Body: body })
    )

    this.logger.debug({ key }, 'Uploaded file to R2')
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
   * Delete every object whose key starts with `prefix`.
   *
   * Used to roll back a partially-uploaded version when a later step
   * (versions.json regeneration, etc.) fails. Caller is expected to
   * swallow errors — a rollback failure should not mask the original.
   *
   * @param prefix - Key prefix to wipe (e.g. `@rack/node/1.0.0`)
   */
  async deletePrefix(prefix: string): Promise<void> {
    let continuationToken: string | undefined

    do {
      const list = await this.client.send(
        new ListObjectsV2Command({
          Prefix: prefix,
          Bucket: this.bucketName,
          ContinuationToken: continuationToken
        })
      )

      for (const obj of list.Contents ?? []) {
        if (!obj.Key) continue
        await this.client.send(
          new DeleteObjectCommand({ Bucket: this.bucketName, Key: obj.Key })
        )
      }

      continuationToken = list.IsTruncated
        ? list.NextContinuationToken
        : undefined
    } while (continuationToken)
  }

  /**
   * Find all SemVer version prefixes for a registry in R2.
   *
   * Uses ListObjectsV2 with delimiter to simulate directory listing,
   * paginating until every page has been collected — without this loop
   * a registry with more versions than fit in a single ListObjectsV2
   * response (the default cap is 1000) would silently lose old version
   * directories from versions.json.
   *
   * @param registryPrefix - e.g. `@rack/node/`
   * @returns List of version strings
   */
  async findVersions(registryPrefix: string): Promise<string[]> {
    const prefix = registryPrefix.endsWith('/')
      ? registryPrefix
      : `${registryPrefix}/`

    const versions: string[] = []
    let continuationToken: string | undefined

    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Prefix: prefix,
          Delimiter: '/',
          Bucket: this.bucketName,
          ContinuationToken: continuationToken
        })
      )

      for (const cp of response.CommonPrefixes ?? []) {
        if (!cp.Prefix) continue
        const name = cp.Prefix.slice(prefix.length).replace(/\/$/, '')
        if (SEMVER_PATTERN.test(name)) versions.push(name)
      }

      continuationToken = response.IsTruncated
        ? response.NextContinuationToken
        : undefined
    } while (continuationToken)

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
