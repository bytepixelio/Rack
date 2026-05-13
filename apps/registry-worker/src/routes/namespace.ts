/**
 * Namespace discovery routes (Worker).
 *
 * Both routes are auth-aware: token-gated namespaces are hidden from
 * unauthenticated callers so that namespace names and registry lists
 * are not leaked to anyone who cannot access them.
 */

import { json, notFound, badRequest } from '../lib/response.js'
import { loadAuthConfig, enforceNamespaceAccess } from '../lib/auth.js'
import { extractToken, filterAllowedNamespaces } from '@rack/auth-core'
import {
  CACHE_HEADERS,
  listRegistries,
  NAMESPACE_PATTERN
} from '@rack/registry-core'

import type { RegistryStore } from '@rack/registry-core'

// ─── Public API ────────────────────────────────────────────────────────────

/** GET /namespaces */
export async function handleNamespaces(
  bucket: R2Bucket,
  adminToken: string | undefined,
  request: Request
): Promise<Response> {
  // R2 list is a paged API: a single call only returns up to `list-limit`
  // results plus a `cursor` for the next page. `handleNamespaceRegistries`
  // already paginates via `toRegistryStore()`; this entrypoint silently
  // dropped every namespace past the first page (§6.18), so once a bucket
  // grew past ~1000 top-level prefixes `rk list` would stop seeing the
  // tail. Walk the cursor until R2 reports `truncated: false`.
  const collected = new Set<string>()
  let cursor: string | undefined
  do {
    const page = await bucket.list({ delimiter: '/', cursor })
    for (const prefix of page.delimitedPrefixes ?? []) {
      const trimmed = prefix.replace(/\/$/, '')
      // §6.24: filter by the full namespace pattern. A stray prefix
      // like `@Bad/` or `@bad./` would otherwise reach the auth filter
      // and surface as a visible-but-not-installable namespace.
      if (NAMESPACE_PATTERN.test(trimmed)) collected.add(trimmed)
    }
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)

  const all = [...collected].sort()

  const config = await loadAuthConfig(bucket)
  const token = extractToken(
    request.headers.get('authorization'),
    request.headers.get('x-registry-token')
  )
  const isAdmin = !!(adminToken && token === adminToken)

  const namespaces = filterAllowedNamespaces(config, all, token, { isAdmin })

  return json({ namespaces }, 200, CACHE_HEADERS.short)
}

/** GET /namespaces/:namespace/registries */
export async function handleNamespaceRegistries(
  bucket: R2Bucket,
  adminToken: string | undefined,
  request: Request,
  namespace: string
): Promise<Response> {
  if (!NAMESPACE_PATTERN.test(namespace)) {
    return badRequest(
      'INVALID_NAMESPACE',
      `Namespace must match ${NAMESPACE_PATTERN.source}`
    )
  }

  // Auth check (reuses the same flow as /registries/**)
  const authError = await enforceNamespaceAccess(
    bucket,
    adminToken,
    request,
    namespace
  )
  if (authError) return authError

  const probe = await bucket.list({ prefix: `${namespace}/`, limit: 1 })
  if (probe.objects.length === 0) {
    return notFound('NAMESPACE_NOT_FOUND', `Namespace ${namespace} not found`)
  }

  const registries = await listRegistries(toRegistryStore(bucket), namespace)

  return json({ namespace, registries }, 200, CACHE_HEADERS.short)
}

/**
 * Adapter that turns an R2 bucket into a `RegistryStore` — yields every
 * key under `prefix`, paginating through `bucket.list` if necessary.
 */
function toRegistryStore(bucket: R2Bucket): RegistryStore {
  return {
    walk: async function* (prefix: string): AsyncIterable<string> {
      let cursor: string | undefined
      do {
        const page = await bucket.list({ prefix, cursor })
        for (const obj of page.objects) yield obj.key
        cursor = page.truncated ? page.cursor : undefined
      } while (cursor)
    }
  }
}
