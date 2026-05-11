/**
 * Console logger with level-based filtering.
 *
 * Messages below the current level are silently discarded.
 * Levels are ordered by priority: debug < info < warn < error < silent.
 * All output is prefixed with `[Rack]`.
 */

import chalk from 'chalk'
import { getErrorHint } from '../utils/error-hints.js'
import { AppError, getErrorMessage } from '../utils/errors.js'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent'

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4
}

const PREFIX = '[Rack]'

export class Logger {
  private level: LogLevel

  /**
   * @param level - Initial log level (default: `'info'`)
   */
  constructor(level: LogLevel = 'info') {
    this.level = level
  }

  /**
   * Log a debug message (lowest priority).
   *
   * @param message - Message text
   * @param args    - Extra values forwarded to `console.debug`
   */
  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      console.debug(`${PREFIX} ${message}`, ...args)
    }
  }

  /**
   * Log an informational message.
   *
   * @param message - Message text
   * @param args    - Extra values forwarded to `console.info`
   */
  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      console.info(`${PREFIX} ${message}`, ...args)
    }
  }

  /**
   * Log a warning.
   *
   * @param message - Message text
   * @param args    - Extra values forwarded to `console.warn`
   */
  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      console.warn(`${PREFIX} ${message}`, ...args)
    }
  }

  /**
   * Log an error (highest priority).
   *
   * @param message - Message text
   * @param args    - Extra values forwarded to `console.error`
   */
  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      console.error(`${PREFIX} ${message}`, ...args)
    }
  }

  /**
   * Log a fatal command error in the standard CLI format:
   *
   * ```
   * ✗ {command} command [CODE]: {message}
   *   Hint: {actionable next step}
   * ```
   *
   * The `[CODE]` prefix and `Hint:` line are emitted only when the
   * error is an {@link AppError} with a registered hint. They let
   * both humans and AI agents see the machine-readable code and an
   * actionable next command without parsing prose.
   *
   * @param command - Human-readable command name (e.g., `'Add'`, `'Config get'`)
   * @param error   - Caught error value
   */
  commandError(command: string, error: unknown): void {
    const code = error instanceof AppError ? ` [${error.code}]` : ''
    this.error(
      chalk.red(`✗ ${command} command${code}: ${getErrorMessage(error)}`)
    )

    const hint =
      error instanceof AppError ? getErrorHint(error.code) : undefined
    if (hint) this.error(chalk.yellow(`  Hint: ${hint}`))
  }

  /**
   * Change the current log level at runtime.
   *
   * @param level - New log level
   */
  setLevel(level: LogLevel): void {
    this.level = level
  }

  /**
   * Return the current log level.
   */
  getLevel(): LogLevel {
    return this.level
  }

  // ─── Internal ───────────────────────────────────────────────────────────

  private shouldLog(level: LogLevel): boolean {
    return LEVELS[level] >= LEVELS[this.level]
  }
}
