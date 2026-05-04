import { describe, it, expect } from 'vitest'
import { Command } from 'commander'
import { registerConfigCommand } from '../../../../src/lib/commands/config/index.js'

describe('config/index', () => {
  it('registers set/get/list/remove subcommands under config', () => {
    const program = new Command()
    registerConfigCommand(program)
    const config = program.commands.find((c) => c.name() === 'config')!
    const names = config.commands.map((c) => c.name()).sort()
    expect(names).toEqual(['get', 'list', 'remove', 'set'])
  })
})
