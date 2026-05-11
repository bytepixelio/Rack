/**
 * Shared file-path validation for `files[].path` in registry items.
 *
 * Both the CLI (when resolving download URLs) and the server (when
 * validating uploads) must agree on what constitutes a legal template
 * path. Centralizing the rules here prevents schema / CLI / server
 * drift that has historically produced silent file-skip bugs.
 *
 * Allowed format: relative POSIX path, optional `./` prefix,
 * each segment matches `[A-Za-z0-9._@+-]+`, no `.` or `..` segments.
 * Percent-encoding, query (`?`), fragment (`#`), and backslash are
 * all forbidden — paths are plain filenames, not URIs.
 */

// ─── Types ──────────────────────────────────────────────────────────

export interface ValidatedFilePath {
  /** Normalized path with `./` prefix stripped. */
  normalized: string
  /** Individual path segments (split by `/`). */
  segments: string[]
}

// ─── Constants ──────────────────────────────────────────────────────

const SEGMENT_RE = /^[A-Za-z0-9._@+-]+$/

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Validate and normalize a `files[].path` value.
 *
 * @param filePath - Raw path from registry.json
 * @returns Normalized path and segments
 * @throws {Error} If the path is invalid
 *
 * @example
 * validateFilePath('./templates/app.vue')
 * // → { normalized: 'templates/app.vue', segments: ['templates', 'app.vue'] }
 */
export function validateFilePath(filePath: string): ValidatedFilePath {
  if (!filePath) {
    throw new Error(`Invalid file path: path is empty`)
  }

  if (
    filePath.includes('%') ||
    filePath.includes('?') ||
    filePath.includes('#')
  ) {
    throw new Error(`Invalid file path: ${filePath} (contains %, ?, or #)`)
  }

  if (filePath.includes('\\')) {
    throw new Error(`Invalid file path: ${filePath} (contains backslash)`)
  }

  if (filePath.startsWith('/')) {
    throw new Error(`Invalid file path: ${filePath} (absolute path)`)
  }

  const normalized = filePath.startsWith('./') ? filePath.slice(2) : filePath

  if (!normalized) {
    throw new Error(`Invalid file path: ${filePath} (resolves to empty)`)
  }

  const segments = normalized.split('/')

  for (const seg of segments) {
    if (seg === '.' || seg === '..') {
      throw new Error(`Invalid file path: ${filePath} (traversal segment)`)
    }

    if (!SEGMENT_RE.test(seg)) {
      throw new Error(
        `Invalid file path: ${filePath} (invalid segment "${seg}")`
      )
    }
  }

  return { normalized, segments }
}

/**
 * JSON Schema pattern equivalent of the runtime validation above.
 *
 * Matches: optional `./` prefix, then one or more `/`-separated
 * segments of `[A-Za-z0-9._@+-]+`. Rejects `%`, `?`, `#`, `\`,
 * absolute paths, empty segments, and `.`/`..` segments.
 */
export const FILE_PATH_PATTERN =
  '^(?:\\.\\/)?(?!\\.{1,2}(?:\\/|$))[A-Za-z0-9._@+\\-]+(?:\\/(?!\\.{1,2}(?:\\/|$))[A-Za-z0-9._@+\\-]+)*$'
