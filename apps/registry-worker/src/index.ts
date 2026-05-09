/**
 * Cloudflare Worker — Rack Registry R2 proxy.
 *
 * Translates registry-server URL conventions into R2 object keys
 * so static files on R2 can serve the same API the Fastify server exposes.
 */

import { handleHealth } from './routes/health.js'
import { handlePreset } from './routes/preset.js'
import { handleSchema } from './routes/schema.js'
import { json, notFound } from './lib/response.js'
import { handleRegistry } from './routes/registry.js'
import {
  handleNamespaces,
  handleNamespaceRegistries
} from './routes/namespace.js'

interface Env {
  BUCKET: R2Bucket
  /** System-level admin token (Workers secret). Bypasses per-namespace auth when matched. */
  ADMIN_TOKEN?: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json(
        { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' },
        405
      )
    }

    const { pathname } = new URL(request.url)

    if (pathname === '/health') {
      return handleHealth(env.BUCKET)
    }

    const presetMatch = pathname.match(/^\/presets\/([^/]+)$/)
    if (presetMatch) {
      return handlePreset(env.BUCKET, presetMatch[1])
    }

    const schemaMatch = pathname.match(/^\/schemas\/([^/]+)$/)
    if (schemaMatch) {
      return handleSchema(env.BUCKET, schemaMatch[1])
    }

    if (pathname === '/namespaces') {
      return handleNamespaces(env.BUCKET, env.ADMIN_TOKEN, request)
    }

    const nsMatch = pathname.match(/^\/namespaces\/([^/]+)\/registries$/)
    if (nsMatch) {
      // CLI sends `@rack` percent-encoded (`%40rack`); Worker URL parsing
      // does not auto-decode path segments, so callers would otherwise
      // hit the `must start with @` validation in handleNamespaceRegistries.
      let namespace: string
      try {
        namespace = decodeURIComponent(nsMatch[1])
      } catch {
        return json(
          { code: 'INVALID_NAMESPACE', message: 'Invalid namespace encoding' },
          400
        )
      }
      return handleNamespaceRegistries(
        env.BUCKET,
        env.ADMIN_TOKEN,
        request,
        namespace
      )
    }

    if (pathname.startsWith('/registries/')) {
      return handleRegistry(
        env.BUCKET,
        env.ADMIN_TOKEN,
        request,
        pathname.slice('/registries/'.length)
      )
    }

    return notFound('NOT_FOUND', 'Route not found')
  }
} satisfies ExportedHandler<Env>
