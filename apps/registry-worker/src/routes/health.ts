import { json } from '../lib/response.js'

/** GET /health — verify R2 bucket has `.healthcheck` marker. */
export async function handleHealth(bucket: R2Bucket): Promise<Response> {
  const obj = await bucket.head('.healthcheck')

  if (obj) {
    return json({ status: 'ok', checks: { storage: { status: 'ok' } } })
  }

  return json(
    {
      status: 'error',
      checks: {
        storage: { status: 'error', error: '.healthcheck not found' }
      }
    },
    503
  )
}
