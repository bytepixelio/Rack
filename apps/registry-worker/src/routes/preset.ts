import { CACHE_HEADERS, PATH_SEGMENT_PATTERN } from '@rack/registry-core'
import { notFound, badRequest, streamObject } from '../lib/response.js'

/**
 * GET /presets/:name → R2 `presets/{name}/preset.json`.
 *
 * Rejects names that do not match the schema's kebab-case pattern
 * (§6.21). Without this check, an encoded traversal like
 * `/presets/%2e%2e%2fsecret` would fall through to `bucket.get` with a
 * literal key — silently 404 on the Worker but bubble up as a 500 on
 * the Server. Both runtimes now answer 400 INVALID_PRESET.
 */
export async function handlePreset(
  bucket: R2Bucket,
  name: string
): Promise<Response> {
  if (!PATH_SEGMENT_PATTERN.test(name)) {
    return badRequest(
      'INVALID_PRESET',
      `Preset name must match ${PATH_SEGMENT_PATTERN.source}`
    )
  }

  const key = `presets/${name}/preset.json`
  const obj = await bucket.get(key)
  if (!obj) return notFound('NOT_FOUND', `Preset "${name}" not found`)
  return streamObject(obj, 'application/json', CACHE_HEADERS.long)
}
