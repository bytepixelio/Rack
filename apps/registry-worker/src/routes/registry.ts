import { CACHE } from '../lib/constants.js'
import { parseRegistryUrl } from '../lib/parser.js'
import { enforceNamespaceAccess } from '../lib/auth.js'
import {
  mimeType,
  notFound,
  readJSON,
  badRequest,
  streamObject
} from '../lib/response.js'

/** GET /registries/* */
export async function handleRegistry(
  bucket: R2Bucket,
  adminToken: string | undefined,
  request: Request,
  wildcardPath: string
): Promise<Response> {
  const urlPath = `/${wildcardPath}`.replace(/\/{2,}/g, '/')
  const parsed = parseRegistryUrl(urlPath)
  if (!parsed) {
    return badRequest('INVALID_PATH', 'Invalid registry resource path')
  }

  const { type, namespace, segments, version, filePath } = parsed

  const authError = await enforceNamespaceAccess(
    bucket,
    adminToken,
    request,
    namespace
  )
  if (authError) return authError

  const segmentPath = segments.join('/')

  switch (type) {
    case 'versions': {
      const key = `${namespace}/${segmentPath}/versions.json`
      const obj = await bucket.get(key)
      if (!obj) return notFound('NOT_FOUND', 'No versions available')
      return streamObject(obj, 'application/json', CACHE.short)
    }

    case 'versioned': {
      const key = `${namespace}/${segmentPath}/${version}/registry.json`
      const obj = await bucket.get(key)
      if (!obj) return notFound('NOT_FOUND', 'Registry version not found')
      return streamObject(obj, 'application/json', CACHE.immutable)
    }

    case 'latest': {
      const versionsKey = `${namespace}/${segmentPath}/versions.json`
      const versionsData = await readJSON<{ versions?: string[] }>(
        bucket,
        versionsKey
      )
      if (!versionsData?.versions?.length) {
        return notFound('NOT_FOUND', 'No versions available')
      }
      const latestVersion = versionsData.versions[0]
      const key = `${namespace}/${segmentPath}/${latestVersion}/registry.json`
      const obj = await bucket.get(key)
      if (!obj) return notFound('NOT_FOUND', 'Latest registry not found')
      return streamObject(obj, 'application/json', CACHE.short)
    }

    case 'file': {
      const key = `${namespace}/${segmentPath}/${version}/${filePath}`
      const obj = await bucket.get(key)
      if (!obj) return notFound('NOT_FOUND', 'File not found')
      return streamObject(obj, mimeType(filePath!), CACHE.immutable)
    }
  }
}
