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
