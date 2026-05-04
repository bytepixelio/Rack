/**
 * Prometheus metrics plugin.
 *
 * Exposes `GET /metrics` with default Node.js process metrics
 * and a custom HTTP request duration histogram.
 *
 * Each Fastify instance gets its own Prometheus Registry to
 * avoid conflicts when multiple instances run in parallel (e.g. tests).
 */

import fp from 'fastify-plugin'
import promMetrics from 'fastify-metrics'
import { Registry, Histogram } from 'prom-client'
import { HISTOGRAM_BUCKETS } from '../constants.js'

import type { FastifyInstance } from 'fastify'

async function metricsPlugin(app: FastifyInstance): Promise<void> {
  const registry = new Registry()

  // Default Node.js metrics (CPU, memory, event loop, GC, etc.)
  await app.register(promMetrics, {
    endpoint: '/metrics',
    routeMetrics: { enabled: false },
    defaultMetrics: { register: registry, enabled: true, prefix: '' }
  })

  // Custom HTTP request duration histogram
  const duration = new Histogram({
    registers: [registry],
    buckets: HISTOGRAM_BUCKETS,
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code']
  })

  // Track request start time via WeakMap (no memory leak risk)
  const startTimes = new WeakMap<object, bigint>()

  app.addHook('onRequest', async (request) => {
    startTimes.set(request, process.hrtime.bigint())
  })

  app.addHook('onResponse', async (request, reply) => {
    const start = startTimes.get(request) as bigint

    duration.observe(
      {
        method: request.method,
        route: request.routeOptions.url,
        status_code: reply.statusCode.toString()
      },
      Number(process.hrtime.bigint() - start) / 1e9
    )
  })

  app.log.info('Metrics plugin registered at /metrics')
}

export default fp(metricsPlugin, { name: 'metrics' })
