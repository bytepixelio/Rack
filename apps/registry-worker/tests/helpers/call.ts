/**
 * Thin wrappers around route handlers so tests can call them with
 * minimal boilerplate. Builds a default `Request` and lets callers
 * override pieces they care about.
 */

import { handleRegistry } from '../../src/routes/registry.js'

interface RegistryCallOptions {
  request?: Request
  adminToken?: string
}

/** Call `handleRegistry` with sensible defaults for tests. */
export function callRegistry(
  bucket: R2Bucket,
  wildcardPath: string,
  options: RegistryCallOptions = {}
): Promise<Response> {
  return handleRegistry(
    bucket,
    options.adminToken,
    options.request ?? new Request('http://localhost/'),
    wildcardPath
  )
}
