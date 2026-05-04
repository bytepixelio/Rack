/**
 * Test helper: build a Commander program and invoke a registered command.
 */

import { Command } from 'commander'

export function buildProgram(register: (p: Command) => void): Command {
  const program = new Command()
  program.exitOverride()
  register(program)
  return program
}

export async function runCommand(
  register: (p: Command) => void,
  argv: string[]
): Promise<void> {
  const program = buildProgram(register)
  await program.parseAsync(['node', 'rk', ...argv])
}
