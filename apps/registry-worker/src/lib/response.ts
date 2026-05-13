/**
 * HTTP response helpers.
 */

import { mimeType, CACHE_HEADERS } from '@rack/registry-core'

export { mimeType }

/** Return a JSON response. Defaults to `no-store` — pass a `CACHE_HEADERS` tier for cacheable responses. */
export function json(
  data: unknown,
  status = 200,
  cacheControl: string = CACHE_HEADERS.none
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Cache-Control': cacheControl,
      'Content-Type': 'application/json'
    }
  })
}

/** 404 JSON response. Never cached. */
export function notFound(code: string, message: string): Response {
  return json({ code, message }, 404)
}

/** 400 JSON response. Never cached. */
export function badRequest(code: string, message: string): Response {
  return json({ code, message }, 400)
}

/** Stream an R2 object as a Response with a caller-specified cache tier. */
export function streamObject(
  obj: R2ObjectBody,
  contentType: string,
  cacheControl: string
): Response {
  return new Response(obj.body, {
    headers: {
      ETag: obj.etag,
      'Content-Type': contentType,
      'Cache-Control': cacheControl,
      'Content-Length': obj.size.toString()
    }
  })
}

/** Read an R2 JSON file and parse it. */
export async function readJSON<T>(
  bucket: R2Bucket,
  key: string
): Promise<T | null> {
  const obj = await bucket.get(key)
  if (!obj) return null
  return obj.json<T>()
}
