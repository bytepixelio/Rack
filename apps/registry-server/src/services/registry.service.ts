/**
 * Registry query service.
 *
 * Resolves filesystem paths for registry resources: versions list,
 * specific version, latest version, and template files.
 * All path resolution is delegated to `lib/path.ts`.
 */

import { NotFoundError } from '../lib/errors.js'
import {
  resolveFilePath,
  resolveRegistryPath,
  resolveVersionsPath
} from '../lib/path.js'

import type { StorageService } from './storage.service.js'

export class RegistryService {
  private readonly storageRoot: string
  private readonly storage: StorageService

  /**
   * Create a new RegistryService.
   *
   * @param storageRoot - Absolute path to the storage root
   * @param storage - StorageService instance for file reads
   */
  constructor(storageRoot: string, storage: StorageService) {
    this.storage = storage
    this.storageRoot = storageRoot
  }

  /**
   * Get the path to a registry's versions.json.
   *
   * @param namespace - e.g. `@rack`
   * @param segments - e.g. `['runtimes', 'node']`
   * @returns Absolute path to versions.json
   *
   * @example
   * registry.getVersionsPath('@rack', ['node'])
   * // → '/storage/@rack/node/versions.json'
   */
  getVersionsPath(namespace: string, segments: string[]): string {
    return resolveVersionsPath(this.storageRoot, namespace, segments)
  }

  /**
   * Get the path to a specific version's registry.json.
   *
   * @param namespace - e.g. `@rack`
   * @param segments - e.g. `['node']`
   * @param version - e.g. `1.0.0`
   * @returns Absolute path to registry.json
   *
   * @example
   * registry.getVersionedPath('@rack', ['node'], '1.0.0')
   * // → '/storage/@rack/node/1.0.0/registry.json'
   */
  getVersionedPath(
    namespace: string,
    segments: string[],
    version: string
  ): string {
    return resolveRegistryPath(this.storageRoot, namespace, segments, version)
  }

  /**
   * Resolve the latest version and return its registry.json path.
   *
   * Reads versions.json to find the first (newest) version.
   *
   * @param namespace - e.g. `@rack`
   * @param segments - e.g. `['node']`
   * @returns Absolute path to the latest registry.json
   * @throws {NotFoundError} When no versions exist
   *
   * @example
   * // versions.json contains { versions: ['2.0.0', '1.0.0'] }
   * await registry.getLatestPath('@rack', ['node'])
   * // → '/storage/@rack/node/2.0.0/registry.json'
   */
  async getLatestPath(namespace: string, segments: string[]): Promise<string> {
    const versionsPath = resolveVersionsPath(
      this.storageRoot,
      namespace,
      segments
    )

    let raw: string
    try {
      raw = await this.storage.readFile(versionsPath)
    } catch {
      throw new NotFoundError('NOT_FOUND', 'No versions available')
    }

    const { versions } = JSON.parse(raw) as { versions?: string[] }

    if (!versions?.length) {
      throw new NotFoundError('NOT_FOUND', 'No versions available')
    }

    return resolveRegistryPath(
      this.storageRoot,
      namespace,
      segments,
      versions[0]
    )
  }

  /**
   * Get the path to a template file inside a versioned registry.
   *
   * @param namespace - e.g. `@rack`
   * @param segments - e.g. `['node']`
   * @param version - e.g. `1.0.0`
   * @param filePath - Relative path, e.g. `src/index.ts`
   * @returns Absolute file path
   *
   * @example
   * registry.getFilePath('@rack', ['node'], '1.0.0', 'src/index.ts')
   * // → '/storage/@rack/node/1.0.0/src/index.ts'
   */
  getFilePath(
    namespace: string,
    segments: string[],
    version: string,
    filePath: string
  ): string {
    return resolveFilePath(
      this.storageRoot,
      namespace,
      segments,
      version,
      filePath
    )
  }
}
