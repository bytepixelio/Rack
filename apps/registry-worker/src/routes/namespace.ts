import { CACHE } from '../lib/constants.js'
import { json, badRequest } from '../lib/response.js'

/** GET /namespaces */
export async function handleNamespaces(bucket: R2Bucket): Promise<Response> {
  const listed = await bucket.list({ delimiter: '/' })
  const namespaces = (listed.delimitedPrefixes ?? [])
    .map((p) => p.replace(/\/$/, ''))
    .filter((p) => p.startsWith('@'))
    .sort()
  return json({ namespaces }, 200, CACHE.short)
}

/** GET /namespaces/:namespace/registries */
export async function handleNamespaceRegistries(
  bucket: R2Bucket,
  namespace: string
): Promise<Response> {
  if (!namespace.startsWith('@')) {
    return badRequest('INVALID_NAMESPACE', 'Namespace must start with @')
  }

  const prefix = `${namespace}/`
  const listed = await bucket.list({ prefix, delimiter: '' })

  const registryPaths = new Set<string>()
  for (const obj of listed.objects) {
    if (obj.key.endsWith('/versions.json')) {
      const relative = obj.key.slice(prefix.length)
      const registryPath = relative.slice(0, -'/versions.json'.length)
      if (registryPath) registryPaths.add(registryPath)
    }
  }

  return json(
    { namespace, registries: [...registryPaths].sort() },
    200,
    CACHE.short
  )
}
