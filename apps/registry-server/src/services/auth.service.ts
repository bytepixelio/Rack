/**
 * Authentication and authorization service.
 *
 * Loads namespace-level token configuration from `auth.json` on disk and
 * delegates all parsing and verification to `@rack/auth-core` — the
 * Cloudflare Worker reads the same file from R2 and runs the same logic.
 *
 * Auth model (shared with the Worker):
 * - A namespace NOT in auth.json → forbidden
 * - A namespace with an empty token array `[]` → anonymous (open)
 * - A namespace with tokens → requires a matching, non-expired token
 */

import { readFile } from 'fs/promises'
import {
  verifyAccess,
  emptyAuthConfig,
  parseAuthConfig,
  isNamespaceAllowed,
  isNamespaceAnonymous
} from '@rack/auth-core'

import type { AuthConfig, AccessResult } from '@rack/auth-core'

export class AuthService {
  private readonly filePath: string
  private config: AuthConfig = emptyAuthConfig()

  /**
   * Create a new AuthService.
   *
   * @param filePath - Absolute path to auth.json
   */
  constructor(filePath: string) {
    this.filePath = filePath
  }

  /**
   * Load token configuration from disk.
   *
   * If the file does not exist, all namespaces default to forbidden.
   *
   * @throws {Error} On JSON parse errors or non-ENOENT filesystem errors
   */
  async load(): Promise<void> {
    let raw: string

    try {
      raw = await readFile(this.filePath, 'utf-8')
    } catch (error) {
      this.config = emptyAuthConfig()
      // File not found → no namespaces allowed
      if ((error as { code?: string }).code === 'ENOENT') return
      throw error
    }

    this.config = parseAuthConfig(JSON.parse(raw))
  }

  /** Whether a namespace is declared in auth.json. */
  isNamespaceAllowed(namespace: string): boolean {
    return isNamespaceAllowed(this.config, namespace)
  }

  /** Whether a namespace allows anonymous (unauthenticated) access. */
  isNamespaceAnonymous(namespace: string): boolean {
    return isNamespaceAnonymous(this.config, namespace)
  }

  /**
   * Verify whether a token grants access to a namespace.
   *
   * **Important:** Callers must check {@link isNamespaceAllowed} first.
   */
  verifyAccess(namespace: string, tokenValue: string | null): AccessResult {
    return verifyAccess(this.config, namespace, tokenValue)
  }
}
