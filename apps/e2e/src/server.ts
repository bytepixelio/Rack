import path from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { rm, mkdtemp, writeFile } from 'node:fs/promises'
import { buildApp } from '../../registry-server/src/app.js'

import type { AddressInfo } from 'node:net'
import type { Config } from '../../registry-server/src/types.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_STORAGE_ROOT = path.resolve(HERE, '../../../packages/storage')
const DEFAULT_SCHEMA_DIR = path.join(DEFAULT_STORAGE_ROOT, 'schema')

export interface TestServer {
  /** Read URL. In remote mode this is the Worker (r2) or Server (local). */
  url: string
  /**
   * Upload URL. Always the Server. In local (in-process) mode equal to
   * `url`; in remote mode sourced from `RACK_SERVER_URL`. Undefined when
   * remote mode is active but no server URL was provided.
   */
  serverUrl?: string
  /**
   * Admin token for uploads. In local mode, whatever `options.adminToken`
   * was passed. In remote mode, sourced from `RACK_ADMIN_TOKEN`. Undefined
   * when no admin token is configured.
   */
  adminToken?: string
  close: () => Promise<void>
}

export interface StartServerOptions {
  /** Storage root served by the registry server. Defaults to `packages/storage`. */
  storageRoot?: string
  /** Namespaces granted anonymous read. Defaults to `['@rack']`. */
  anonymousNamespaces?: string[]
  /** Admin token for uploads. Only honored in local (in-process) mode. */
  adminToken?: string
}

/**
 * Start an in-process registry server.
 *
 * Listens on 127.0.0.1:0 and returns the ephemeral URL. Auth.json is
 * synthesized with anonymous-read entries for each namespace in
 * `anonymousNamespaces`, letting the CLI fetch without tokens.
 *
 * When `RACK_REGISTRY_URL` is set, skips the in-process server and returns
 * the remote URL directly — used for post-deploy smoke against a live
 * registry. Upload-capable tests additionally honor `RACK_SERVER_URL` +
 * `RACK_ADMIN_TOKEN`. Tests that rely on custom storage roots or synthetic
 * namespaces (e.g. toy fixtures) must self-skip in that mode.
 */
export async function startServer(
  options: StartServerOptions = {}
): Promise<TestServer> {
  const remoteUrl = process.env.RACK_REGISTRY_URL
  if (remoteUrl) {
    if (options.storageRoot || options.anonymousNamespaces) {
      throw new Error(
        'startServer: storageRoot / anonymousNamespaces cannot be honored ' +
          'when RACK_REGISTRY_URL is set — skip this test in remote-target mode'
      )
    }
    return {
      url: remoteUrl,
      serverUrl: process.env.RACK_SERVER_URL,
      adminToken: process.env.RACK_ADMIN_TOKEN,
      close: async () => {}
    }
  }

  const namespaces = options.anonymousNamespaces ?? ['@rack']
  const storageRoot = options.storageRoot ?? DEFAULT_STORAGE_ROOT

  const authDir = await mkdtemp(path.join(tmpdir(), 'rack-e2e-auth-'))
  const authPath = path.join(authDir, 'auth.json')
  const authPayload = Object.fromEntries(namespaces.map((ns) => [ns, []]))
  await writeFile(authPath, JSON.stringify(authPayload))

  const config: Config = {
    port: 0,
    storageRoot,
    nodeEnv: 'test',
    trustProxy: false,
    host: '127.0.0.1',
    logLevel: 'silent',
    storageBackend: 'local',
    authConfigPath: authPath,
    adminToken: options.adminToken,
    schemaDir: DEFAULT_SCHEMA_DIR,
    webhookConfigPath: path.join(authDir, 'webhooks.json')
  }

  const app = await buildApp(config)
  await app.listen({ port: 0, host: '127.0.0.1' })

  const address = app.server.address() as AddressInfo
  const url = `http://127.0.0.1:${address.port}`

  return {
    url,
    serverUrl: url,
    adminToken: options.adminToken,
    close: async () => {
      await app.close()
      await rm(authDir, { recursive: true, force: true })
    }
  }
}
