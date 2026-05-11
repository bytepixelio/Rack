import { Command } from 'commander'
import { it, expect, describe } from 'vitest'
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
