/**
 * @rack/registry-core — shared registry protocol primitives.
 *
 * The registry server (Fastify, Node) and the registry worker
 * (Cloudflare Worker, R2) implement the same public read protocol —
 * identical URL scheme, identical key layout, identical
 * `versions.json` ordering. This package is the single source of
 * truth for that protocol's pure derivation logic: URL parsing, key
 * building, type → category mapping, listing algorithm, and cache
 * header tiers.
 *
 * What lives here: only what must agree byte-for-byte across both
 * runtimes. HTTP framework specifics (Fastify reply, Workers
 * `Response`) and storage primitives (fs, R2 SDK) stay in each app.
 */

export type {
  RegistryLocator,
  ParsedRegistryUrl,
  RegistryResourceType,
  RegistryManifestPathInput
} from './types.js'

export type { RegistryStore } from './listing.js'

export { parseRegistryUrl } from './parser.js'
export { deriveSegments } from './segments.js'
export { listRegistries } from './listing.js'
export {
  buildFileKey,
  buildRegistryKey,
  buildVersionsKey,
  buildRegistryDirKey
} from './keys.js'
export {
  CACHE_HEADERS,
  SCHEMA_FILES,
  SEMVER_PATTERN,
  CATEGORY_BY_TYPE
} from './constants.js'
