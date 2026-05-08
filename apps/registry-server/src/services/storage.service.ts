/**
 * Storage service for filesystem operations.
 *
 * Centralizes all file reads, directory scanning, health checks,
 * and version management. No other module should access the
 * filesystem directly.
 */

import semver from 'semver'
import { join, relative, sep } from 'path'
import { listRegistries, SEMVER_PATTERN } from '@rack/registry-core'
import {
  rm,
  stat,
  mkdir,
  rename,
  access,
  readdir,
  readFile,
  writeFile
} from 'fs/promises'

import type { StorageHealthResult } from '../types.js'

export class StorageService {
  /** Absolute path to the storage root directory. */
  private readonly storageRoot: string

  /**
   * Create a new StorageService.
   *
   * @param storageRoot - Absolute path to the storage root directory
   */
  constructor(storageRoot: string) {
    this.storageRoot = storageRoot
  }

  // ─── Health Check ────────────────────────────────────────────────────────

  /**
   * Check whether the storage directory is accessible.
   *
   * Attempts to read the `.healthcheck` sentinel file inside
   * the storage root.
   *
   * @returns Health check result with accessibility status
   */
  async checkHealth(): Promise<StorageHealthResult> {
    try {
      await access(join(this.storageRoot, '.healthcheck'))
      return { accessible: true }
    } catch (error) {
      return {
        accessible: false,
        error: (error as Error).message
      }
    }
  }

  // ─── File Operations ─────────────────────────────────────────────────────

  /**
   * Read a file as a UTF-8 string.
   *
   * @param filePath - Absolute path to the file
   * @returns File contents
   * @throws {Error} When the file cannot be read
   */
  async readFile(filePath: string): Promise<string> {
    return readFile(filePath, 'utf-8')
  }

  /**
   * Write a UTF-8 string to a file.
   *
   * @param filePath - Absolute path to the file
   * @param content - File contents to write
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    await writeFile(filePath, content, 'utf-8')
  }

  /**
   * Check whether a path exists on disk.
   *
   * @param targetPath - Absolute path to check
   * @returns `true` if the path exists
   */
  async exists(targetPath: string): Promise<boolean> {
    try {
      await access(targetPath)
      return true
    } catch {
      return false
    }
  }

  /**
   * Create a directory recursively.
   *
   * @param dirPath - Absolute path to the directory
   */
  async mkdirp(dirPath: string): Promise<void> {
    await mkdir(dirPath, { recursive: true })
  }

  /**
   * Atomically move a file or directory.
   *
   * @param source - Source path
   * @param destination - Destination path
   */
  async rename(source: string, destination: string): Promise<void> {
    await rename(source, destination)
  }

  /**
   * Remove a file or directory.
   *
   * @param targetPath - Path to remove
   * @param options - Removal options (recursive, force)
   */
  async remove(
    targetPath: string,
    options?: { recursive?: boolean; force?: boolean }
  ): Promise<void> {
    await rm(targetPath, options)
  }

  // ─── Directory Scanning ──────────────────────────────────────────────────

  /**
   * Discover all namespaces in storage.
   *
   * A namespace is any directory in the storage root whose name
   * starts with `@`.
   *
   * @returns Sorted list of namespace names
   *
   * @example
   * // Storage root contains: @rack/, @company/, presets/, schema/
   * await storage.findNamespaces()
   * // → ['@company', '@rack']
   */
  async findNamespaces(): Promise<string[]> {
    const entries = await readdir(this.storageRoot, { withFileTypes: true })

    return entries
      .filter((e) => e.isDirectory() && e.name.startsWith('@'))
      .map((e) => e.name)
      .sort()
  }

  /**
   * Discover all registries within a namespace.
   *
   * Walks the namespace recursively and treats every directory that
   * has a `versions.json` as a registry — matching the worker's
   * "find every key ending in `/versions.json`" listing semantics
   * (`@rack/registry-core:listRegistries`).
   *
   * @param namespace - Namespace to scan (e.g. `@rack`)
   * @returns Sorted list of registry-relative paths (e.g. `['quality/husky']`)
   * @throws {Error} When the namespace directory does not exist
   *
   * @example
   * // @rack/quality/husky/{1.0.0/, versions.json}
   * // @rack/runtimes/node/{1.0.0/, versions.json}
   * await storage.findRegistries('@rack')
   * // → ['quality/husky', 'runtimes/node']
   */
  async findRegistries(namespace: string): Promise<string[]> {
    // Probe the namespace dir up front so a missing namespace surfaces
    // as an ENOENT (caller maps that to 404), and a non-directory entry
    // (e.g. a stray file at `@<ns>`) surfaces as a 500. Errors inside
    // the recursive walk are swallowed instead — a missing nested dir
    // mid-iteration shouldn't kill the listing.
    const stats = await stat(join(this.storageRoot, namespace))
    if (!stats.isDirectory()) {
      throw Object.assign(new Error('ENOTDIR'), { code: 'ENOTDIR' })
    }

    return listRegistries(this.toRegistryStore(), namespace)
  }

  /**
   * Adapter that turns the local fs into a `RegistryStore` — yields every
   * file path under a key prefix, recursively, with forward-slash
   * separators. Tolerates per-entry `readdir` failures so a transient
   * mid-walk error doesn't crash the whole listing.
   */
  private toRegistryStore() {
    const root = this.storageRoot
    return {
      walk: async function* (prefix: string): AsyncIterable<string> {
        async function* go(dir: string): AsyncIterable<string> {
          let entries
          try {
            entries = await readdir(dir, { withFileTypes: true })
          } catch {
            return
          }
          for (const entry of entries) {
            const abs = join(dir, entry.name)
            if (entry.isDirectory()) {
              yield* go(abs)
            } else if (entry.isFile()) {
              yield relative(root, abs).split(sep).join('/')
            }
          }
        }
        yield* go(join(root, prefix))
      }
    }
  }

  // ─── Version Management ──────────────────────────────────────────────────

  /**
   * Find all SemVer version directories for a registry.
   *
   * @param registryDir - Absolute path to the registry directory
   * @returns List of version strings (unsorted)
   *
   * @example
   * // registryDir contains: 1.0.0/, 2.1.0/, 0.9.0/, readme.md
   * await storage.findVersions('/storage/@rack/node')
   * // → ['1.0.0', '2.1.0', '0.9.0']
   */
  async findVersions(registryDir: string): Promise<string[]> {
    const entries = await readdir(registryDir, { withFileTypes: true })

    return entries
      .filter((e) => e.isDirectory() && SEMVER_PATTERN.test(e.name))
      .map((e) => e.name)
  }

  /**
   * Sort version strings in descending SemVer order (newest first).
   *
   * @param versions - Array of version strings
   * @returns New sorted array
   *
   * @example
   * storage.sortVersionsDescending(['1.0.0', '2.1.0', '0.9.0'])
   * // → ['2.1.0', '1.0.0', '0.9.0']
   */
  sortVersionsDescending(versions: string[]): string[] {
    return [...versions].sort(semver.rcompare)
  }
}
