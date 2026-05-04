/**
 * Filesystem utilities with added safety.
 *
 * Thin wrappers around `node:fs/promises` that handle common
 * concerns: existence checks return booleans instead of throwing,
 * writes auto-create parent directories, and chmod errors are
 * silently ignored for cross-platform compatibility.
 */

import { constants } from 'node:fs'
import { dirname } from 'node:path'
import {
  mkdir,
  access,
  chmod as nodeChmod,
  readFile as nodeReadFile,
  writeFile as nodeWriteFile
} from 'node:fs/promises'

/**
 * Check whether a path exists on the filesystem.
 *
 * @param path - Absolute or relative path to check
 * @returns `true` if the path is accessible, `false` otherwise
 */
export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Ensure a directory exists, creating it recursively if needed.
 *
 * @param path - Directory path to create
 */
export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true })
}

/**
 * Read a file as a UTF-8 string (or another encoding).
 *
 * @param path     - File path to read
 * @param encoding - Character encoding (default: `'utf8'`)
 * @returns File contents as a string
 */
export async function readFile(
  path: string,
  encoding: BufferEncoding = 'utf8'
): Promise<string> {
  return await nodeReadFile(path, encoding)
}

/**
 * Write string or binary content to a file.
 *
 * Parent directories are created automatically if they don't exist.
 * When `contents` is a Buffer the `encoding` parameter is ignored.
 *
 * @param path     - File path to write
 * @param contents - String or Buffer to write
 * @param encoding - Character encoding for string content (default: `'utf8'`)
 */
export async function writeFile(
  path: string,
  contents: string | Buffer,
  encoding: BufferEncoding = 'utf8'
): Promise<void> {
  await ensureDir(dirname(path))
  if (Buffer.isBuffer(contents)) {
    await nodeWriteFile(path, contents)
  } else {
    await nodeWriteFile(path, contents, encoding)
  }
}

/**
 * Read and parse a JSON file.
 *
 * @param path - Path to the JSON file
 * @returns Parsed JSON data
 */
export async function readJSON<T = unknown>(path: string): Promise<T> {
  const content = await readFile(path, 'utf8')
  return JSON.parse(content) as T
}

/**
 * Serialize data to JSON and write it to a file.
 *
 * Parent directories are created automatically.
 *
 * @param path   - File path to write
 * @param data   - Value to serialize (must be JSON-serializable)
 * @param indent - Number of spaces for pretty-printing (default: 2)
 */
export async function writeJSON(
  path: string,
  data: unknown,
  indent: number = 2
): Promise<void> {
  await writeFile(path, JSON.stringify(data, null, indent), 'utf8')
}

/**
 * Set file permissions.
 *
 * Errors are silently ignored so callers don't need to handle
 * platforms where chmod is unsupported (e.g. Windows).
 *
 * @param path - File path
 * @param mode - Permission bits (e.g. `0o755`)
 */
export async function chmod(path: string, mode: number): Promise<void> {
  try {
    await nodeChmod(path, mode)
  } catch {
    // ignore — chmod may fail on Windows or restricted filesystems
  }
}
