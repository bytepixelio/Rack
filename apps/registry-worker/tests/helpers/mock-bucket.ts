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
  options: CreateMockBucketOptions = {}
): R2Bucket {
  const store = new Map<string, string>()

  const authConfig =
    options.authConfig === undefined ? DEFAULT_AUTH_CONFIG : options.authConfig
  if (authConfig !== null) {
    store.set('.auth/auth.json', JSON.stringify(authConfig))
  }

  for (const [key, value] of Object.entries(files)) {
    store.set(key, typeof value === 'string' ? value : JSON.stringify(value))
  }

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
      const prefixes = new Set<string>()

      for (const [key, data] of store) {
        if (!key.startsWith(prefix)) continue

        if (delimiter) {
          const rest = key.slice(prefix.length)
          const idx = rest.indexOf(delimiter)
          if (idx !== -1) {
            prefixes.add(prefix + rest.slice(0, idx + 1))
            continue
          }
        }

        objects.push(toHeadObject(key, data))
      }

      return {
        objects,
        truncated: false,
        delimitedPrefixes: [...prefixes]
      } as unknown as R2Objects
    },

    // Not used by read-only routes
    put: async () => null as unknown as R2Object,
    delete: async () => {}
  } as unknown as R2Bucket
}
