import { json, badRequest } from '../lib/response.js'
import { CACHE_HEADERS, listRegistries } from '@rack/registry-core'

import type { RegistryStore } from '@rack/registry-core'

/** GET /namespaces */
export async function handleNamespaces(bucket: R2Bucket): Promise<Response> {
  const listed = await bucket.list({ delimiter: '/' })
  const namespaces = (listed.delimitedPrefixes ?? [])
    .map((p) => p.replace(/\/$/, ''))
    .filter((p) => p.startsWith('@'))
    .sort()
  return json({ namespaces }, 200, CACHE_HEADERS.short)
}

/** GET /namespaces/:namespace/registries */
export async function handleNamespaceRegistries(
  bucket: R2Bucket,
  namespace: string
): Promise<Response> {
  if (!namespace.startsWith('@')) {
    return badRequest('INVALID_NAMESPACE', 'Namespace must start with @')
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
