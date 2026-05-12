/**
 * Error classes and helpers for the Rack CLI.
 *
 * Service-layer code throws these typed errors, which are then
 * caught by the command layer and mapped to user-facing messages.
 */

import type { RackJsonErrorCode } from '../rack-json.js'
import type { ConflictInfo } from '../pipeline/conflict.js'

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extract an error message from an unknown value.
 *
 * @param error - Error value of unknown type
 * @returns Error message as a string
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// ─── Base Error ─────────────────────────────────────────────────────────────

/**
 * Base class for all application errors.
 *
 * Carries a machine-readable {@link code} so callers can branch
 * on error type without relying on message text.
 */
export class AppError extends Error {
  /** Machine-readable error code (e.g. `REGISTRY_NOT_FOUND`, `CONFLICT`). */
  public readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = this.constructor.name
    this.code = code
  }
}

// ─── HTTP ───────────────────────────────────────────────────────────────────

/**
 * Error thrown when an HTTP request fails with a non-2xx status code.
 */
export class HttpError extends AppError {
  constructor(
    message: string,
    /** HTTP status code of the failed request. */
    public readonly status: number,
    /** Raw response body (if available). */
    public readonly response?: unknown
  ) {
    super('HTTP_ERROR', message)
  }
}

/**
 * Error thrown when an HTTP request exceeds the configured timeout.
 */
export class TimeoutError extends AppError {
  constructor(message: string) {
    super('TIMEOUT', message)
  }
}

// ─── Registry ───────────────────────────────────────────────────────────────

/**
 * Error thrown when a registry identifier is invalid.
 */
export class InvalidNamespaceError extends AppError {
  constructor(
    message: string,
    /** The identifier that failed validation. */
    public readonly identifier: string
  ) {
    super('INVALID_NAMESPACE', message)
  }
}

/**
 * Error thrown when a registry cannot be found.
 */
export class RegistryNotFoundError extends AppError {
  constructor(
    message: string,
    /** The identifier that was looked up. */
    public readonly identifier: string
  ) {
    super('REGISTRY_NOT_FOUND', message)
  }
}

// ─── Pipeline ───────────────────────────────────────────────────────────────

/**
 * Error thrown when conflicting registries are detected.
 */
export class ConflictError extends AppError {
  constructor(
    message: string,
    /** Detected conflicts. */
    public readonly conflicts: ConflictInfo[]
  ) {
    super('CONFLICT', message)
  }
}

/**
 * Error thrown when a circular dependency is detected.
 */
export class CircularDependencyError extends AppError {
  constructor(
    message: string,
    /** Registry identifiers forming the cycle. */
    public readonly cycle: string[]
  ) {
    super('CIRCULAR_DEPENDENCY', message)
  }
}

/**
 * Error thrown when a registry is already installed at a different version
 * than the one the user (or a transitive dependency) requested.
 *
 * Rack does not support upgrading installed registries — `rk add`
 * scaffolds files into the user's source tree, which become user-owned
 * code. Silently swapping versions would either overwrite user
 * modifications or pick the wrong version. Surface the conflict and let
 * the user explicitly remove + reinstall to switch versions.
 */
export class VersionMismatchError extends AppError {
  constructor(
    /** Identifier already recorded in rack.json (with or without explicit version). */
    public readonly installed: string,
    /** Identifier the caller requested. */
    public readonly requested: string
  ) {
    super(
      'VERSION_MISMATCH',
      `Cannot add ${requested} — ${installed} is already installed at a different version.`
    )
  }
}

/**
 * Error thrown when a single install request contains the same registry
 * more than once at the root level — typically a misconfigured preset
 * that lists the same canonical `namespace/path` twice (with or without
 * differing `@version` / `:language` suffixes).
 *
 * Without this guard the planner silently dedupes by canonical key and
 * keeps whichever entry sorts first, so a preset that *looks* like it
 * installs `runtimes/node@1.0.0` and `runtimes/node@2.0.0` would actually
 * only apply one — picking the other version is a bug, not a feature.
 */
export class DuplicateRegistryError extends AppError {
  constructor(
    /** Canonical `namespace/path` shared by every duplicate. */
    public readonly canonical: string,
    /** All identifier forms that collided on this canonical key. */
    public readonly identifiers: string[]
  ) {
    super(
      'DUPLICATE_REGISTRY',
      `Cannot install duplicate registry ${canonical} — requested as: ${identifiers.join(', ')}.`
    )
  }
}

// ─── Merge ──────────────────────────────────────────────────────────────────

/**
 * Error thrown when a file merge operation fails.
 */
export class MergeError extends AppError {
  constructor(
    message: string,
    /** Target file path that failed to merge. */
    public readonly filePath: string
  ) {
    super('MERGE_FAILED', message)
  }
}

// ─── Project ────────────────────────────────────────────────────────────────

/**
 * Error thrown when rack.json is not found, invalid, or cannot be read/written.
 */
export class RackJsonError extends AppError {
  constructor(
    message: string,
    /** Specific error code for rack.json issues. */
    public readonly errorCode?: RackJsonErrorCode
  ) {
    super('RACK_JSON_ERROR', message)
  }
}

// ─── Path Safety ───────────────────────────────────────────────────────────

/**
 * Error thrown when a file target path escapes the project directory.
 */
export class PathTraversalError extends AppError {
  constructor(
    message: string,
    /** The offending target path from the registry file descriptor. */
    public readonly target: string
  ) {
    super('PATH_TRAVERSAL', message)
  }
}

// ─── Config ────────────────────────────────────────────────────────────────

/**
 * Error thrown when the CLI configuration file is invalid or cannot be processed.
 */
export class ConfigError extends AppError {
  constructor(message: string) {
    super('CONFIG_ERROR', message)
  }
}

// ─── Package ───────────────────────────────────────────────────────────────

/**
 * Error thrown when an existing project `package.json` cannot be parsed.
 *
 * Surfaced before any pipeline write so a corrupted manifest does not
 * get silently overwritten with a freshly-synthesized empty file.
 */
export class PackageJsonInvalidError extends AppError {
  constructor(
    message: string,
    /** Absolute path to the `package.json` that failed to parse. */
    public readonly filePath: string
  ) {
    super('PACKAGE_JSON_INVALID', message)
  }
}

// ─── File Apply ────────────────────────────────────────────────────────────

/**
 * Error thrown when a remote template file required by the manifest
 * could not be fetched. Aborts the apply pipeline so the project is
 * not left in a half-applied state where `package.json` / `rack.json`
 * record a successful install but the source files are missing.
 */
export class FileFetchError extends AppError {
  constructor(
    message: string,
    /** Manifest-relative source path that failed to fetch. */
    public readonly sourcePath: string,
    /** Project-relative target path that would have received the file. */
    public readonly target: string
  ) {
    super('FILE_FETCH_FAILED', message)
  }
}
