/**
 * Shared test doubles: logger, prompter, and registry item factory.
 */

import { vi } from 'vitest'
import type { Logger } from '../../src/lib/infra/logger.js'
import type { Prompter } from '../../src/lib/infra/prompts.js'
import type { ResolvedRegistryItem } from '../../src/lib/registry/types.js'

export function createMockLogger(): Logger {
  const mock = {
    setLevel: vi.fn(),
    getLevel: vi.fn(() => 'info' as const),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    commandError: vi.fn()
  }
  return mock as unknown as Logger
}

export function createMockPrompter(
  overrides: Partial<Record<keyof Prompter, unknown>> = {}
): Prompter {
  const mock = {
    confirm: vi.fn(),
    select: vi.fn(),
    text: vi.fn(),
    spinner: vi.fn(() => ({
      start: vi.fn(),
      stop: vi.fn(),
      succeed: vi.fn(),
      fail: vi.fn(),
      text: ''
    })),
    withSpinner: vi.fn(async (_l: unknown, _t: string, fn: () => unknown) =>
      fn()
    ),
    ...overrides
  }
  return mock as unknown as Prompter
}

export function createItem(
  overrides: Partial<ResolvedRegistryItem> = {}
): ResolvedRegistryItem {
  return {
    name: 'demo',
    type: 'registry:feature',
    version: '1.0.0',
    priority: 3,
    namespace: '@rack',
    identifier: '@rack/demo',
    registryUrl: 'https://registry.example.com/registries/@rack/demo/1.0.0',
    ...overrides
  }
}
