/**
 * Business error classes for the Registry Server.
 *
 * Service-layer code throws these typed errors, which are then
 * caught by the error-handler plugin and mapped to HTTP responses.
 */

/**
 * Base class for all application errors.
 *
 * Carries a machine-readable {@link code} and an HTTP {@link statusCode}
 * so the error handler can produce a consistent JSON response.
 */
export class AppError extends Error {
  /** Machine-readable error code (e.g. `NOT_FOUND`, `UNAUTHORIZED`). */
  public readonly code: string

  /** HTTP status code to return to the client. */
  public readonly statusCode: number

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message)
    this.name = this.constructor.name
    this.code = code
    this.statusCode = statusCode
  }
}

/**
 * Resource not found (HTTP 404).
 */
export class NotFoundError extends AppError {
  constructor(code: string, message: string) {
    super(code, message, 404)
  }
}

/**
 * Access denied — authenticated but lacking permission (HTTP 403).
 */
export class ForbiddenError extends AppError {
  constructor(code: string, message: string) {
    super(code, message, 403)
  }
}

/**
 * Request conflicts with current state (HTTP 409).
 */
export class ConflictError extends AppError {
  constructor(code: string, message: string) {
    super(code, message, 409)
  }
}

/**
 * Input validation failure (HTTP 400).
 */
export class ValidationError extends AppError {
  constructor(code: string, message: string) {
    super(code, message, 400)
  }
}

/**
 * Rate limit exceeded (HTTP 429).
 */
export class RateLimitError extends AppError {
  constructor(message: string) {
    super('RATE_LIMIT_EXCEEDED', message, 429)
  }
}
