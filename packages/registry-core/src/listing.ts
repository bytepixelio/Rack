/**
 * Backend-agnostic listing of registries within a namespace.
 *
 * The server provides an fs-based {@link RegistryStore} (recursive
 * `readdir`); the worker provides an R2-based one (`bucket.list` with a
 * prefix). The listing algorithm itself — "find every key matching
 * `<namespace>/**​/versions.json`, derive the registry-relative
 * prefix" — is shared so both runtimes return identical results.
 */

// ─── Types ───────────────────────────────────────────────────────────

/**
 * Storage primitive that can yield every key/path under a prefix,
 * recursively. Implementations are free to choose any traversal order;
 * callers do not depend on it.
 */
export interface RegistryStore {
  /**
   * Yield every key (R2) or relative file path (fs) under `prefix`.
   *
   * @param prefix - Trailing-slash-terminated, e.g. `@rack/`
   */
  walk(prefix: string): AsyncIterable<string>
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Discover every registry path inside a namespace.
 *
 * @param store     - Backend-specific walker
 * @param namespace - Including the leading `@`, e.g. `@rack`
 * @returns De-duped, sorted relative paths (e.g. `['build/typescript', 'quality/husky']`)
 *
 * @example
 * await listRegistries(fsStore, '@rack')
 * // → ['build/rollup', 'build/typescript', 'quality/eslint', ...]
 */
export async function listRegistries(
  store: RegistryStore,
  namespace: string
): Promise<string[]> {
  const prefix = `${namespace}/`
  const suffix = '/versions.json'
  const found = new Set<string>()

  for await (const key of store.walk(prefix)) {
    if (!key.endsWith(suffix)) continue
    const relative = key.slice(prefix.length, -suffix.length)
    if (relative) found.add(relative)
  }

  return [...found].sort()
}
