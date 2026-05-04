import { notFound, streamObject } from '../lib/response.js'
import { CACHE, SCHEMA_WHITELIST } from '../lib/constants.js'

/** GET /schemas/:file → R2 `schema/{file}` */
export async function handleSchema(
  bucket: R2Bucket,
  file: string
): Promise<Response> {
  if (!SCHEMA_WHITELIST.has(file)) {
    return notFound('NOT_FOUND', 'Schema not found')
  }
  const key = `schema/${file}`
  const obj = await bucket.get(key)
  if (!obj) return notFound('NOT_FOUND', 'Schema not found')
  return streamObject(obj, 'application/json', CACHE.long)
}
