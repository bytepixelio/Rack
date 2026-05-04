/**
 * Health checks for the `rk doctor` command.
 *
 * Three categories of checks are run in parallel: environment
 * (Node.js version, git availability), project (rack.json validity),
 * and remote (registry server health).
 */

import semver from 'semver'
import path from 'node:path'
import { promisify } from 'node:util'
import { rackrc } from '../../rackrc.js'
import { execFile } from 'node:child_process'
import { rackJson } from '../../rack-json.js'
import { HttpClient } from '../../infra/http.js'
import { getMinNodeVersion } from '../../utils/version.js'

const execFileAsync = promisify(execFile)

// ─── Types ────────────────────────────────────────────────────────────────

export type CheckLevel = 'info' | 'warning' | 'error'

export interface CheckResult {
  id: string
  message: string
  level: CheckLevel
  suggestion?: string
  details?: Record<string, unknown>
  category: 'environment' | 'project' | 'remote'
}

export interface CheckSummary {
  hasErrors: boolean
  results: CheckResult[]
}

// ─── Environment Checks ──────────────────────────────────────────────────

/**
 * Check Node.js version against minimum required version.
 *
 * @returns Check result with info or error level
 */
async function checkNodeVersion(): Promise<CheckResult> {
  const nodeVersion = process.version
  const coerced = semver.coerce(nodeVersion)
  const minNodeVersion = await getMinNodeVersion()

  if (!coerced || semver.lt(coerced, minNodeVersion)) {
    return {
      level: 'error',
      id: 'env.node-version',
      category: 'environment',
      suggestion: 'Upgrade Node.js and re-run rk doctor.',
      message: `Node.js ${minNodeVersion}+ is required (detected ${nodeVersion})`
    }
  }

  return {
    level: 'info',
    id: 'env.node-version',
    category: 'environment',
    message: `Node.js version OK (${coerced.version})`
  }
}

/**
 * Check if git is available in the system PATH.
 *
 * @returns Check result with info or warning level
 */
async function checkGitAvailability(): Promise<CheckResult> {
  let gitAvailable = false

  try {
    await execFileAsync('git', ['--version'])
    gitAvailable = true
  } catch {
    // git not found
  }

  return {
    id: 'env.git',
    category: 'environment',
    level: gitAvailable ? 'info' : 'warning',
    message: gitAvailable ? 'git is available' : 'git was not found in PATH',
    suggestion: gitAvailable
      ? undefined
      : 'Install git or make sure it is available in PATH.'
  }
}

// ─── Project Checks ──────────────────────────────────────────────────────

/**
 * Validate rack.json existence and contents.
 *
 * @returns One or two check results (validity + registry count)
 */
async function checkProject(): Promise<CheckResult[]> {
  const cwd = process.cwd()
  const rackJsonPath = path.join(cwd, 'rack.json')

  try {
    const manifest = await rackJson.read(cwd)
    const results: CheckResult[] = [
      {
        level: 'info',
        category: 'project',
        id: 'project.rack-json',
        message: `rack.json is valid (${rackJsonPath})`,
        details: {
          name: manifest.name,
          language: manifest.language,
          template: manifest.template
        }
      }
    ]

    if (!manifest.items || manifest.items.length === 0) {
      results.push({
        level: 'warning',
        category: 'project',
        id: 'project.registries',
        suggestion: 'Use "rk add" to install registries.',
        message: 'rack.json has no registries installed yet'
      })
    } else {
      results.push({
        level: 'info',
        category: 'project',
        id: 'project.registries',
        message: `rack.json lists ${manifest.items.length} registries`
      })
    }

    return results
  } catch (error) {
    return [
      {
        level: 'error',
        category: 'project',
        id: 'project.rack-json',
        suggestion: 'Run "rk init" in this directory to create rack.json.',
        message:
          error instanceof Error ? error.message : 'Failed to read rack.json'
      }
    ]
  }
}

// ─── Remote Checks ───────────────────────────────────────────────────────

/**
 * Check health endpoint for each configured registry.
 *
 * @returns One check result per registry, or a skip message if none configured
 */
async function checkRemote(): Promise<CheckResult[]> {
  const http = new HttpClient()
  const registries = await rackrc.listRegistries()

  return Promise.all(
    Object.entries(registries).map(([namespace, registry]) =>
      checkRegistryHealth(http, namespace, registry)
    )
  )
}

/**
 * Check a single registry's health endpoint.
 *
 * @param http      - HTTP client for the request
 * @param namespace - Registry namespace (e.g. `@rack`)
 * @param registry  - Resolved registry with URL and optional headers
 * @returns Check result with info or error level
 */
async function checkRegistryHealth(
  http: HttpClient,
  namespace: string,
  registry: { url: string; headers?: Record<string, string> }
): Promise<CheckResult> {
  const healthUrl = `${registry.url.replace(/\/+$/, '')}/health`

  try {
    const response = await http.get<{ status: string }>(healthUrl, {
      headers: registry.headers
    })
    return {
      level: 'info',
      category: 'remote',
      id: `remote.${namespace}`,
      message: `Registry ${namespace} healthy (${response.status})`
    }
  } catch (error) {
    return {
      level: 'error',
      category: 'remote',
      id: `remote.${namespace}`,
      message: `Registry ${namespace} health check failed`,
      details: {
        error: error instanceof Error ? error.message : 'Unknown remote error'
      },
      suggestion:
        'Verify registry URL/token via "rk config" and ensure the server is reachable.'
    }
  }
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Run all checks in parallel.
 *
 * @returns Summary with results and error flag
 */
export async function runChecks(): Promise<CheckSummary> {
  const [environment, project, remote] = await Promise.all([
    Promise.all([checkNodeVersion(), checkGitAvailability()]),
    checkProject(),
    checkRemote()
  ])

  const results = [...environment, ...project, ...remote]

  return {
    results,
    hasErrors: results.some((r) => r.level === 'error')
  }
}
