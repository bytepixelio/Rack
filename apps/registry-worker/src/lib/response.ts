/**
 * HTTP response helpers.
 */

import { CACHE } from './constants.js'

/** Return a JSON response. Defaults to `no-store` — pass a CACHE tier for cacheable responses. */
export function json(
  data: unknown,
  status = 200,
  cacheControl: string = CACHE.none
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

/** Guess Content-Type from file extension. */
export function mimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    css: 'text/css',
    ts: 'text/plain',
    yml: 'text/yaml',
    png: 'image/png',
    gif: 'image/gif',
    jsx: 'text/plain',
    tsx: 'text/plain',
    html: 'text/html',
    yaml: 'text/yaml',
    txt: 'text/plain',
    jpg: 'image/jpeg',
    woff: 'font/woff',
    jpeg: 'image/jpeg',
    woff2: 'font/woff2',
    md: 'text/markdown',
    svg: 'image/svg+xml',
    js: 'text/javascript',
    mjs: 'text/javascript',
    cjs: 'text/javascript',
    json: 'application/json'
  }
  return map[ext ?? ''] ?? 'application/octet-stream'
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
