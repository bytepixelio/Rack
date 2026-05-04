import path from 'node:path'
import { execa } from 'execa'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CLI_BIN = path.resolve(HERE, '../../cli/dist/bin.js')

export interface RunCliOptions {
  cwd: string
  home: string
  env?: Record<string, string>
}

export interface CliResult {
  stdout: string
  stderr: string
  exitCode: number
}

/**
 * Execute the built CLI binary (`apps/cli/dist/bin.js`) with the given args.
 *
 * `HOME` is overridden so the CLI reads the synthetic `~/.rackrc` from the
 * test workspace. Does not throw on non-zero exit — callers assert on the
 * returned `exitCode`.
 */
export async function runCli(
  args: string[],
  options: RunCliOptions
): Promise<CliResult> {
  const result = await execa('node', [CLI_BIN, ...args], {
    reject: false,
    cwd: options.cwd,
    env: {
      ...process.env,
      HOME: options.home,
      ...options.env
    }
  })

  return {
    exitCode: result.exitCode ?? -1,
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? '')
  }
}
