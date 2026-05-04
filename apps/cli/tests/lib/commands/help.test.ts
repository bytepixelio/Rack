/**
 * Help output smoke tests.
 *
 * Every command registers an `.addHelpText('after', ...)` block with
 * AI-friendly examples and notes. These tests verify the help text
 * is actually wired up and contains the phrases we care about.
 */

import { describe, it, expect } from 'vitest'
import { Command } from 'commander'

import { registerAddCommand } from '../../../src/lib/commands/add/index.js'
import { registerInitCommand } from '../../../src/lib/commands/init/index.js'
import { registerListCommand } from '../../../src/lib/commands/list/index.js'
import { registerDoctorCommand } from '../../../src/lib/commands/doctor/index.js'
import { registerConfigCommand } from '../../../src/lib/commands/config/index.js'
import { registerVersionCommand } from '../../../src/lib/commands/version/index.js'

function buildProgram(register: (p: Command) => void): Command {
  const program = new Command()
  program.exitOverride()
  register(program)
  return program
}

/** Capture full `--help` output (including addHelpText blocks) as a string. */
function captureHelp(program: Command, argv: string[]): string {
  let captured = ''
  const writeOut = (s: string): void => {
    captured += s
  }
  const apply = (cmd: Command): void => {
    cmd.configureOutput({ writeOut, writeErr: () => {} })
    cmd.commands.forEach(apply)
  }
  apply(program)
  try {
    program.parse(['node', 'rk', ...argv])
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code !== 'commander.helpDisplayed' && code !== 'commander.help') {
      throw err
    }
  }
  return captured
}

describe('command help output', () => {
  it('init --help shows examples and identifier syntax', () => {
    const help = captureHelp(buildProgram(registerInitCommand), [
      'init',
      '--help'
    ])
    expect(help).toContain('Examples:')
    expect(help).toContain('$ rk init -t @presets/tutorial-project')
    expect(help).toContain('Template identifier:')
    expect(help).toContain('@presets/')
  })

  it('add --help shows examples, preconditions and error codes', () => {
    const help = captureHelp(buildProgram(registerAddCommand), [
      'add',
      '--help'
    ])
    expect(help).toContain('Examples:')
    expect(help).toContain('$ rk add @rack/tailwindcss')
    expect(help).toContain('Preconditions:')
    expect(help).toContain('REGISTRY_NOT_FOUND')
    expect(help).toContain('CONFLICT')
  })

  it('list --help shows examples and discovery flow', () => {
    const help = captureHelp(buildProgram(registerListCommand), [
      'list',
      '--help'
    ])
    expect(help).toContain('Examples:')
    expect(help).toContain('$ rk list')
    expect(help).toContain('--json')
    expect(help).toContain('Typical use:')
  })

  it('doctor --help shows examples and exit codes', () => {
    const help = captureHelp(buildProgram(registerDoctorCommand), [
      'doctor',
      '--help'
    ])
    expect(help).toContain('Examples:')
    expect(help).toContain('--json')
    expect(help).toContain('Exit codes:')
  })

  it('version --help shows an example', () => {
    const help = captureHelp(buildProgram(registerVersionCommand), [
      'version',
      '--help'
    ])
    expect(help).toContain('Examples:')
    expect(help).toContain('$ rk version')
  })

  describe('config', () => {
    it('config --help lists subcommand overview', () => {
      const help = captureHelp(buildProgram(registerConfigCommand), [
        'config',
        '--help'
      ])
      expect(help).toContain('Examples:')
      expect(help).toContain('~/.rackrc')
      expect(help).toContain('Subcommands:')
    })

    it('config set --help shows --url/--token/--header examples', () => {
      const help = captureHelp(buildProgram(registerConfigCommand), [
        'config',
        'set',
        '--help'
      ])
      expect(help).toContain('--url')
      expect(help).toContain('--token')
      expect(help).toContain('--header')
      expect(help).toContain('Authorization: Bearer')
    })

    it('config get --help shows --json example', () => {
      const help = captureHelp(buildProgram(registerConfigCommand), [
        'config',
        'get',
        '--help'
      ])
      expect(help).toContain('--json')
    })

    it('config list --help shows --json example', () => {
      const help = captureHelp(buildProgram(registerConfigCommand), [
        'config',
        'list',
        '--help'
      ])
      expect(help).toContain('--json')
    })

    it('config remove --help shows short alias', () => {
      const help = captureHelp(buildProgram(registerConfigCommand), [
        'config',
        'remove',
        '--help'
      ])
      expect(help).toContain('rk config rm')
    })
  })
})

describe('top-level overview', () => {
  it('cli --help appends overview with identifier syntax and flow', async () => {
    const { overviewHelpText } = await import(
      '../../../src/lib/help/overview.js'
    )
    expect(overviewHelpText).toContain('Core concepts:')
    expect(overviewHelpText).toContain('Identifier syntax:')
    expect(overviewHelpText).toContain('Typical flow:')
    expect(overviewHelpText).toContain('@presets/')
    expect(overviewHelpText).toContain('~/.rackrc')
  })
})
