/**
 * Minimal R2Bucket mock backed by an in-memory Map.
 *
 * Stores objects as `{ key → JSON string }` and implements
 * `get`, `head`, and `list` — enough for read-only route tests.
 *
 * Seeds `.auth/auth.json` with `{"@rack": []}` by default so tests that
 * exercise auth-gated routes with the `@rack` namespace pass without
 * needing to spell out the config in every call. Override with `authConfig`.
 */

import type { RawAuthConfig } from '@rack/auth-core'

interface MockR2ObjectBody {
  key: string
  size: number
  etag: string
  body: ReadableStream
  json: <T>() => Promise<T>
}

interface MockR2Object {
  key: string
  size: number
  etag: string
}

interface CreateMockBucketOptions {
  /** Override `.auth/auth.json` contents. `null` removes the default seed. */
  authConfig?: RawAuthConfig | null
  /**
   * Force R2-style pagination by capping each `list()` response at this
   * many results (objects + delimited prefixes). When unset, every call
   * returns the entire result set in one go.
   *
   * Required by the §6.18 fix to exercise `truncated: true` + `cursor`
   * paths in the namespace handler.
   */
  listPageSize?: number
}

const DEFAULT_AUTH_CONFIG: RawAuthConfig = { '@rack': [] }

function toObjectBody(key: string, data: string): MockR2ObjectBody {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(data)
  return {
    key,
    size: bytes.length,
    etag: `"${key}"`,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(bytes)
        controller.close()
      }
    }),
    json: <T>() => Promise.resolve(JSON.parse(data) as T)
  }
}

function toHeadObject(key: string, data: string): MockR2Object {
  return { key, size: new TextEncoder().encode(data).length, etag: `"${key}"` }
}

export function createMockBucket(
  files: Record<string, unknown>,
  bucketOptions: CreateMockBucketOptions = {}
): R2Bucket {
  const store = new Map<string, string>()

  const authConfig =
    bucketOptions.authConfig === undefined
      ? DEFAULT_AUTH_CONFIG
      : bucketOptions.authConfig
  if (authConfig !== null) {
    store.set('.auth/auth.json', JSON.stringify(authConfig))
  }

  for (const [key, value] of Object.entries(files)) {
    store.set(key, typeof value === 'string' ? value : JSON.stringify(value))
  }

  const pageSize = bucketOptions.listPageSize

  return {
    get: async (key: string) => {
      if (!store.has(key)) return null
      return toObjectBody(key, store.get(key)!) as unknown as R2ObjectBody
    },

    head: async (key: string) => {
      if (!store.has(key)) return null
      return toHeadObject(key, store.get(key)!) as unknown as R2Object
    },

    list: async (options?: R2ListOptions) => {
      const prefix = options?.prefix ?? ''
      const delimiter = options?.delimiter ?? ''

      const objects: MockR2Object[] = []
      const prefixes: string[] = []
      const seen = new Set<string>()

      for (const [key, data] of store) {
        if (!key.startsWith(prefix)) continue

        if (delimiter) {
          const rest = key.slice(prefix.length)
          const idx = rest.indexOf(delimiter)
          if (idx !== -1) {
            const p = prefix + rest.slice(0, idx + 1)
            if (!seen.has(p)) {
              seen.add(p)
              prefixes.push(p)
            }
            continue
          }
        }

        objects.push(toHeadObject(key, data))
      }

      // R2 returns results in lexicographic key order. Sort both lists so
      // pagination cursors are deterministic — the namespace handler now
      // depends on walking `truncated: true` pages until exhausted.
      prefixes.sort()
      objects.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))

      const items: Array<{ kind: 'object' | 'prefix'; value: unknown }> = [
        ...prefixes.map((p) => ({ kind: 'prefix' as const, value: p })),
        ...objects.map((o) => ({ kind: 'object' as const, value: o }))
      ]

      const cursor = options?.cursor
      const start = cursor ? Number.parseInt(cursor, 10) : 0
      const end = pageSize
        ? Math.min(items.length, start + pageSize)
        : items.length
      const slice = items.slice(start, end)
      const truncated = end < items.length

      return {
        objects: slice
          .filter((item) => item.kind === 'object')
          .map((item) => item.value as MockR2Object),
        truncated,
        delimitedPrefixes: slice
          .filter((item) => item.kind === 'prefix')
          .map((item) => item.value as string),
        cursor: truncated ? String(end) : undefined
      } as unknown as R2Objects
    },

    // Not used by read-only routes
    put: async () => null as unknown as R2Object,
    delete: async () => {}
  } as unknown as R2Bucket
}
