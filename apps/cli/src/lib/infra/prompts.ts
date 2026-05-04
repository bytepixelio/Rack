/**
 * User interaction layer (prompts + spinners).
 *
 * Wraps the `prompts` library for terminal input and `ora` for
 * progress spinners. When running in CI mode (`--ci` flag),
 * prompts return defaults and spinners become no-ops.
 */

import ora from 'ora'
import inquirer from 'prompts'

import type { Logger } from './logger.js'

// ─── Option types ─────────────────────────────────────────────────────────

export interface ConfirmOptions {
  message: string
  initial?: boolean
}

export interface SelectOption<T = string> {
  value: T
  title: string
  description?: string
}

export interface SelectOptions<T = string> {
  message: string
  initial?: number
  choices: SelectOption<T>[]
}

export interface TextOptions {
  message: string
  initial?: string
  validate?: (value: string) => boolean | string
}

// ─── Spinner ──────────────────────────────────────────────────────────────

export interface Spinner {
  stop(): void
  text: string
  start(): void
  fail(text?: string): void
  succeed(text?: string): void
}

// ─── Prompter ─────────────────────────────────────────────────────────────

export class Prompter {
  private ci: boolean

  /**
   * @param ci - When `true`, all prompts return defaults and spinners
   *             are silent. Auto-detected from `--ci` CLI flag.
   */
  constructor(ci = process.argv.includes('--ci')) {
    this.ci = ci
  }

  /**
   * Ask a yes/no question.
   *
   * @param options - Confirm prompt options
   * @returns `true` if confirmed, `false` otherwise
   */
  async confirm(options: ConfirmOptions): Promise<boolean> {
    if (this.ci) return options.initial ?? false

    const res = await inquirer({
      type: 'confirm',
      name: 'value',
      message: options.message,
      initial: options.initial ?? false
    })
    return res.value ?? false
  }

  /**
   * Show a selection menu.
   *
   * @param options - Select prompt options
   * @returns The chosen value, or `null` if cancelled
   */
  async select<T = string>(options: SelectOptions<T>): Promise<T | null> {
    if (this.ci) {
      const idx = options.initial ?? 0
      return options.choices[idx]?.value ?? null
    }

    const res = await inquirer({
      type: 'select',
      name: 'value',
      message: options.message,
      choices: options.choices,
      initial: options.initial ?? 0
    })
    return (res.value as T) ?? null
  }

  /**
   * Ask for free-form text input.
   *
   * @param options - Text prompt options
   * @returns The entered string, or `null` if cancelled
   */
  async text(options: TextOptions): Promise<string | null> {
    if (this.ci) return options.initial ?? null

    const res = await inquirer({
      type: 'text',
      name: 'value',
      message: options.message,
      initial: options.initial,
      validate: options.validate
    })
    return res.value ?? null
  }

  /**
   * Create a progress spinner.
   *
   * In CI mode the spinner is a silent no-op.
   *
   * @param text       - Text displayed next to the spinner
   * @param prefixText - Optional prefix before the spinner
   * @returns A {@link Spinner} handle
   */
  spinner(text: string, prefixText?: string): Spinner {
    if (this.ci) {
      return { start() {}, succeed() {}, fail() {}, stop() {}, text }
    }

    return ora({ text, prefixText })
  }

  /**
   * Run an async task wrapped in a spinner.
   *
   * Logger output below `warn` is suppressed while the spinner
   * is active to keep the terminal clean. The original level is
   * always restored.
   *
   * @param logger - Logger whose level will be temporarily raised
   * @param text   - Text displayed next to the spinner
   * @param fn     - Async function to execute
   * @returns The value returned by `fn`
   */
  async withSpinner<T>(
    logger: Logger,
    text: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const spinner = this.spinner(text, '[Rack]')
    spinner.start()

    const originalLevel = logger.getLevel()
    logger.setLevel('warn')

    try {
      return await fn()
    } finally {
      logger.setLevel(originalLevel)
      spinner.stop()
    }
  }
}
