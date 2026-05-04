/**
 * Shared types for namespace-token authentication.
 *
 * Used by both the Fastify registry server and the Cloudflare Worker —
 * keep them in lockstep so access decisions never diverge.
 */

/** Information about a validated authentication token. */
export interface TokenInfo {
  /** Optional human-readable label for the token */
  mark?: string

  /** The raw token string */
  token: string

  /** Optional expiration date */
  expiresAt?: Date

  /** Whether this token grants publish permission */
  publish: boolean

  /** Namespace this token belongs to */
  namespace: string
}

/** Result of a namespace access verification check. */
export interface AccessResult {
  /** Whether access is allowed */
  allowed: boolean

  /** Token details when access is granted via authentication */
  token?: TokenInfo

  /** Reason for the access decision */
  reason: 'anonymous' | 'authorized' | 'unauthorized'

  /** Error details when access is denied */
  error?: {
    /** Machine-readable error code */
    code: string
    /** Human-readable error message */
    message: string
    /** HTTP status code */
    statusCode: number
  }
}

/** Raw token entry as stored in auth.json. */
export interface RawNamespaceToken {
  mark?: unknown
  token?: unknown
  publish?: unknown
  expiresAt?: unknown
}

/** Shape of the auth.json configuration file. */
export type RawAuthConfig = Record<
  string,
  RawNamespaceToken[] | null | undefined
>

/** Validated token record stored in a parsed {@link AuthConfig}. */
export interface TokenRecord {
  mark?: string
  token: string
  expiresAt?: Date
  publish: boolean
}

/**
 * Parsed, validated auth config ready for runtime verification.
 *
 * - `allowedNamespaces`: every namespace declared in auth.json, including
 *   anonymous ones (empty token array). A namespace NOT in this set is
 *   forbidden.
 * - `tokens`: only namespaces with at least one valid token. Namespaces
 *   whose tokens were all rejected fall back to anonymous (absent from
 *   this map).
 */
export interface AuthConfig {
  allowedNamespaces: Set<string>
  tokens: Map<string, Map<string, TokenRecord>>
}
