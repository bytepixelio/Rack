import {
  CACHE_HEADERS,
  buildFileKey,
  buildRegistryKey,
  buildVersionsKey,
  parseRegistryUrl
} from '@rack/registry-core'
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

  const { type, locator } = parsed

  const authError = await enforceNamespaceAccess(
    bucket,
    adminToken,
    request,
    locator.namespace
  )
  if (authError) return authError

  switch (type) {
    case 'versions': {
      const obj = await bucket.get(buildVersionsKey(locator))
      if (!obj) return notFound('NOT_FOUND', 'No versions available')
      return streamObject(obj, 'application/json', CACHE_HEADERS.short)
    }

    case 'versioned': {
      const obj = await bucket.get(
        buildRegistryKey({ ...locator, version: locator.version! })
      )
      if (!obj) return notFound('NOT_FOUND', 'Registry version not found')
      return streamObject(obj, 'application/json', CACHE_HEADERS.immutable)
    }

    case 'latest': {
      const versionsData = await readJSON<{ versions?: string[] }>(
        bucket,
        buildVersionsKey(locator)
      )
      if (!versionsData?.versions?.length) {
        return notFound('NOT_FOUND', 'No versions available')
      }
      const obj = await bucket.get(
        buildRegistryKey({ ...locator, version: versionsData.versions[0] })
      )
      if (!obj) return notFound('NOT_FOUND', 'Latest registry not found')
      return streamObject(obj, 'application/json', CACHE_HEADERS.short)
    }

    case 'file': {
      const obj = await bucket.get(
        buildFileKey({
          ...locator,
          version: locator.version!,
          filePath: locator.filePath!
        })
      )
      if (!obj) return notFound('NOT_FOUND', 'File not found')
      return streamObject(obj, mimeType(locator.filePath!), CACHE_HEADERS.immutable)
    }
  }
}
