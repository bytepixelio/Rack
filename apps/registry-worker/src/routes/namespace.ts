/**
 * Namespace discovery routes (Worker).
 *
 * Both routes are auth-aware: token-gated namespaces are hidden from
 * unauthenticated callers so that namespace names and registry lists
 * are not leaked to anyone who cannot access them.
 */

import { loadAuthConfig, enforceNamespaceAccess } from '../lib/auth.js'
import { json, badRequest, notFound } from '../lib/response.js'
import { CACHE_HEADERS, listRegistries } from '@rack/registry-core'
import { extractToken, filterAllowedNamespaces } from '@rack/auth-core'

import type { RegistryStore } from '@rack/registry-core'

// ─── Public API ────────────────────────────────────────────────────────────

/** GET /namespaces */
export async function handleNamespaces(
  bucket: R2Bucket,
  adminToken: string | undefined,
  request: Request
): Promise<Response> {
  const listed = await bucket.list({ delimiter: '/' })
  const all = (listed.delimitedPrefixes ?? [])
    .map((p) => p.replace(/\/$/, ''))
    .filter((p) => p.startsWith('@'))
    .sort()

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
  if (!namespace.startsWith('@')) {
    return badRequest('INVALID_NAMESPACE', 'Namespace must start with @')
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
