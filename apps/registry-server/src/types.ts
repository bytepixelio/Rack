/**
 * Central type definitions for Registry Server.
 *
 * All shared interfaces and types used across the application are defined here.
 */

// ─── Config ──────────────────────────────────────────────────────────────────

/** Storage backend type: local filesystem or Cloudflare R2. */
export type StorageBackend = 'local' | 'r2'

/** Server configuration loaded from environment variables. */
export interface Config {
  /** HTTP server port */
  port: number

  /** HTTP server bind address */
  host: string

  /** Runtime environment: development | production */
  nodeEnv: string

  /** Pino logger level: trace | debug | info | warn | error | fatal */
  logLevel: string

  /** Root directory for registry file storage (uploaded packages) */
  storageRoot: string

  /**
   * Directory that holds the JSON Schema files. Kept separate from
   * `storageRoot` so Docker can place schemas in an image-owned path
   * (e.g. `/app/schema`) that a named volume on `storageRoot` cannot
   * shadow. Defaults to `<storageRoot>/schema` when unset.
   */
  schemaDir: string

  /** System-level admin token for cross-namespace publishing (optional) */
  adminToken?: string

  /** Path to auth.json configuration file */
  authConfigPath: string

  /** Path to webhooks.json configuration file */
  webhookConfigPath: string

  /** Storage backend for uploads: 'local' (default) or 'r2' */
  storageBackend: StorageBackend

  /** R2 configuration (required when storageBackend is 'r2') */
  r2?: {
    accountId: string
    bucketName: string
    accessKeyId: string
    secretAccessKey: string
  }
}

// ─── Webhook ─────────────────────────────────────────────────────────────────

/** Supported registry event types. */
export type RegistryEventType = 'uploaded' | 'version.created'

/** Payload emitted when a registry event occurs. */
export interface RegistryEventPayload {
  /** Registry name (e.g. `runtimes/node`) */
  name: string

  /** Full path identifier (e.g. `@rack/runtimes/node/1.0.0`) */
  path: string

  /** SemVer version string */
  version: string

  /** ISO 8601 timestamp of when the event occurred */
  timestamp: string

  /** Registry namespace (e.g. `@rack`) */
  namespace: string

  /** Event type identifier */
  event: RegistryEventType
}

/** Webhook endpoint configuration from webhooks.json. */
export interface WebhookConfig {
  /** Target URL to deliver the webhook to */
  url: string

  /** Secret used for HMAC-SHA256 signature generation */
  secret: string

  /** Whether this webhook is active */
  enabled: boolean

  /** Optional human-readable description */
  description?: string

  /** Event types this webhook subscribes to */
  events: RegistryEventType[]
}

/** Shape of the webhooks.json configuration file. */
export interface WebhookConfigFile {
  /** List of webhook endpoint configurations */
  webhooks: WebhookConfig[]
}

/** Internal webhook delivery job tracked by the queue. */
export interface WebhookJob {
  /** Unique job identifier */
  id: string

  /** Current attempt number (starts at 0, incremented before each delivery) */
  attempt: number

  /** Scheduled time for the next retry */
  nextRetryAt?: Date

  /** Maximum number of delivery attempts */
  maxAttempts: number

  /** Webhook configuration for this delivery */
  webhook: WebhookConfig

  /** Event payload to deliver */
  payload: RegistryEventPayload
}

/** Result of a single webhook delivery attempt. */
export interface WebhookDeliveryResult {
  /** Error message on failure */
  error?: string

  /** Total number of attempts made */
  attempts: number

  /** Whether delivery was successful (2xx response) */
  success: boolean

  /** HTTP status code from the target, if available */
  statusCode?: number
}

// ─── Storage ─────────────────────────────────────────────────────────────────

/** Result of a storage health check. */
export interface StorageHealthResult {
  /** Error message when storage is not accessible */
  error?: string

  /** Whether the storage is accessible */
  accessible: boolean
}
