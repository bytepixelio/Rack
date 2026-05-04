/**
 * Additional `--help` text for the `rk doctor` command.
 */

export const doctorHelpText = `
Examples:
  $ rk doctor
  $ rk doctor --json        # machine-readable; recommended for AI tools

Checks:
  - Node / package manager versions
  - rack.json presence and validity (when inside a rack project)
  - Connectivity to each configured registry in ~/.rackrc

Exit codes:
  0  all checks pass (warnings allowed)
  1  at least one error — see the report or --json output
`
