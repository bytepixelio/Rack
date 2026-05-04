import { CACHE } from '../lib/constants.js'
import { notFound, streamObject } from '../lib/response.js'

/** GET /presets/:name → R2 `presets/{name}/preset.json` */
export async function handlePreset(
  bucket: R2Bucket,
  name: string
): Promise<Response> {
  const key = `presets/${name}/preset.json`
  const obj = await bucket.get(key)
  if (!obj) return notFound('NOT_FOUND', `Preset "${name}" not found`)
  return streamObject(obj, 'application/json', CACHE.long)
}
