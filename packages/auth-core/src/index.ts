/**
 * @rack/auth-core — shared namespace-token authentication.
 *
 * The registry server reads auth.json from disk; the Cloudflare Worker
 * reads it from R2. Both parse it into an {@link AuthConfig} and call the
 * same {@link verifyAccess} logic — there is no second copy to drift.
 */

export type {
  TokenInfo,
  AuthConfig,
  TokenRecord,
  AccessResult,
  RawAuthConfig,
  AuthConfigError,
  RawNamespaceToken
} from './types.js'

export { extractToken } from './extract.js'
export { parseAuthConfig, emptyAuthConfig } from './parse.js'
export {
  verifyAccess,
  isNamespaceAllowed,
  isNamespaceAnonymous
} from './access.js'
