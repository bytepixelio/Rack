/**
 * Explicit install-plan construction.
 *
 * Both `rk init` and `rk add` need to answer the same questions before
 * they touch disk: which transitive deps must we fetch, which are
 * already installed (and can be skipped), do any registries conflict,
 * and in what order should the survivors be applied. The old pipelines
 * answered those questions inline with bespoke arrays, which made it
 * hard to add new semantics (upgrade, dry-run, remove) without threading
 * yet another parameter through every layer.
 *
 * {@link buildInstallPlan} centralizes that work into a single function
 * that returns a fully-typed {@link InstallPlan}. The pipelines then
 * consume `plan.toApply` and `plan.toRecord` directly, leaving the
 * roles named instead of implicit.
 */

import { sortItems } from './sort.js'
import { registry } from '../registry/client.js'
import { validateNoConflicts } from './conflict.js'
import { DuplicateRegistryError } from '../utils/errors.js'
import { canonicalizeIdentifier } from '../registry/identifier.js'
import { resolveRegistryDependencies } from './resolve-dependencies.js'

import type { Logger } from '../infra/logger.js'
import type { Language } from '../registry/types.js'
import type { InstallPlan, ResolvedRegistryItem } from './types.js'

// ─── Types ──────────────────────────────────────────────────────────────────

/** Parameters for {@link buildInstallPlan}. */
export interface BuildInstallPlanParams {
  /** Already-fetched root items (e.g. the result of `fetchTemplate` or a single `fetchItem`). */
  requested: ResolvedRegistryItem[]
  /** Logger for plan-phase progress and warnings. */
  logger: Logger
  /** Identifiers from `rack.json` that are already on disk. Defaults to empty. */
  installedRegistries?: string[]
  /** Language override used when fetching the already-installed items. */
  language?: Language
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Build the {@link InstallPlan} for a set of requested root items.
 *
 * The plan covers four steps without writing to disk:
 *
 * 1. Resolve transitive dependencies (BFS), skipping those already installed.
 * 2. Fetch the installed items themselves so reciprocal `conflicts` can
 *    still be enforced even when transitive resolution short-circuited.
 *    A best-effort `fetchItems` is used; failures degrade the conflict
 *    check (logged as a warning) rather than aborting the install.
 * 3. Validate that no two registries declare a conflict against each
 *    other across the new + installed set.
 * 4. Topologically sort the items so dependencies are applied before
 *    their dependents.
 *
 * @param params - Plan inputs (requested roots, installed identifiers, logger, language)
 * @returns       Fully-populated install plan
 * @throws {DuplicateRegistryError} If two roots share the same canonical
 *                                  `namespace/path` (typically a preset
 *                                  that lists the same registry twice)
 * @throws {ConflictError}        If any two registries conflict
 * @throws {VersionMismatchError} If a transitive dep targets a different
 *                                version of an already-installed registry
 *
 * @example
 * ```ts
 * const plan = await buildInstallPlan({
 *   logger,
 *   requested: [root],
 *   installedRegistries: ['@rack/a']
 * })
 * await applyFiles(plan.toApply, targetDir, logger)
 * ```
 */
export async function buildInstallPlan(
  params: BuildInstallPlanParams
): Promise<InstallPlan> {
  const { logger, language, requested, installedRegistries = [] } = params

  // 0. Reject duplicate roots up front. A preset that lists the same
  // canonical registry twice (e.g. `runtimes/node@1.0.0` +
  // `runtimes/node@2.0.0`, or `frameworks/vue:ts` + `frameworks/vue:js`)
  // would otherwise be silently deduped further down — the user sees a
  // "two registries" preset that only applied one. Surface it as a hard
  // error so the preset gets fixed instead.
  validateNoDuplicateRoots(requested)

  // 1. BFS transitive deps; transitive deps whose canonical id matches an
  // already-installed registry are dropped here (their files and
  // package.json entries are on disk from a previous install).
  const resolved = await resolveRegistryDependencies(
    requested,
    logger,
    installedRegistries
  )

  // 2. Fetch already-installed items. fetchItems is best-effort — a
  // missing registry server / yanked item degrades conflict detection
  // rather than blocking an unrelated install.
  const installedItems = await registry.fetchItems(installedRegistries, {
    language,
    logger
  })
  warnDegradedConflictCheck(installedRegistries, installedItems, logger)

  // 3. Conflict check across new + installed. Pass installedRegistries so
  // a registry whose item failed to fetch can still block the install
  // via its identifier (lightweight fallback inside validateNoConflicts).
  validateNoConflicts([...installedItems, ...resolved], installedRegistries)

  // 4. Topologically sort dependencies before dependents, breaking ties
  // by priority.
  const toApply = sortItems(resolved)

  // Split `resolved` back into "requested roots" vs "transitive deps so
  // each role in the returned plan stays addressable. `resolved` may have
  // re-emitted a root under a different identifier form, so compare by
  // canonical key.
  const requestedKeys = new Set(
    requested.map((r) => canonicalizeIdentifier(r.identifier))
  )
  const resolvedDependencies = resolved.filter(
    (item) => !requestedKeys.has(canonicalizeIdentifier(item.identifier))
  )

  return {
    requested,
    resolvedDependencies,
    toApply,
    alreadyInstalled: installedItems,
    // Persist the version-pinned identifier so unpinned `rk add @rack/foo`
    // / preset roots land in `rack.json.items` as `@rack/foo@1.0.0` — a
    // later `rk add @rack/foo@1.0.0` then matches the existing entry
    // instead of being treated as a `VERSION_MISMATCH` upgrade attempt.
    toRecord: toApply.map((item) => item.resolvedIdentifier)
  }
}

// ─── Internal ───────────────────────────────────────────────────────────────

/**
 * Reject installs whose `requested` list contains the same canonical
 * `namespace/path` more than once. Catches misconfigured presets where
 * different `@version` / `:language` suffixes (or even literal duplicates)
 * collide on the canonical key the planner uses to dedupe downstream.
 *
 * @throws {DuplicateRegistryError} If two or more roots share a canonical key
 */
function validateNoDuplicateRoots(requested: ResolvedRegistryItem[]): void {
  const groups = new Map<string, string[]>()
  for (const item of requested) {
    const key = canonicalizeIdentifier(item.identifier)
    const ids = groups.get(key) ?? []
    ids.push(item.identifier)
    groups.set(key, ids)
  }
  for (const [canonical, ids] of groups) {
    if (ids.length > 1) throw new DuplicateRegistryError(canonical, ids)
  }
}

/**
 * Surface a clear warning when one or more installed registries failed to
 * fetch — without it, an offline / unreachable registry whose `conflicts`
 * array would have blocked the new install silently passes the conflict
 * check via the identifier-only fallback in `validateNoConflicts`.
 */
function warnDegradedConflictCheck(
  requested: string[],
  fetched: { identifier: string }[],
  logger: Logger
): void {
  if (requested.length === 0 || fetched.length === requested.length) return

  const fetchedKeys = new Set(
    fetched.map((it) => canonicalizeIdentifier(it.identifier))
  )
  const missing = requested.filter(
    (id) => !fetchedKeys.has(canonicalizeIdentifier(id))
  )
  if (missing.length === 0) return

  logger.warn(
    `Conflict check is degraded: could not fetch installed ${pluralize(missing.length, 'registry', 'registries')} ` +
      `${missing.join(', ')}. Reciprocal "conflicts" declared by ` +
      `${missing.length === 1 ? 'this registry' : 'these registries'} cannot be enforced.`
  )
}

function pluralize(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}
