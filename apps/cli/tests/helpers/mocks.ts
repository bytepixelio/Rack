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
  const merged: ResolvedRegistryItem = {
    name: 'demo',
    type: 'registry:feature',
    version: '1.0.0',
    priority: 3,
    namespace: '@rack',
    identifier: '@rack/demo',
    registryUrl: 'https://registry.example.com/registries/@rack/demo/1.0.0',
    resolvedLanguage: 'ts',
    resolvedIdentifier: '@rack/demo@1.0.0',
    ...overrides
  }
  // Mirror the production rule (canonical id pinned to item.version) when
  // a test overrides `identifier` / `version` without spelling out the
  // resolved form. Strip any trailing `@version` and `:language` from the
  // override and re-attach the pinned version so test fixtures stay terse.
  if (
    overrides.resolvedIdentifier === undefined &&
    (overrides.identifier !== undefined || overrides.version !== undefined)
  ) {
    const idNoLang = merged.identifier.split(':')[0]
    const lastAt = idNoLang.lastIndexOf('@')
    // The leading `@namespace/...` form means the first `@` is at index 0;
    // only treat a later `@` as the version separator.
    const idNoVersion = lastAt > 0 ? idNoLang.slice(0, lastAt) : idNoLang
    merged.resolvedIdentifier = `${idNoVersion}@${merged.version}`
  }
  return merged
}
