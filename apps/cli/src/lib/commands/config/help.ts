/**
 * Additional `--help` text for the `rk config` command and subcommands.
 *
 * The parent help shows an overview of the subcommand matrix; each
 * subcommand gets its own tailored examples.
 */

export const configHelpText = `
Examples:
  $ rk config list
  $ rk config get @rack
  $ rk config set @rack --url https://registry.rackjs.com
  $ rk config remove @corp

Config file: ~/.rackrc (JSON)

Subcommands:
  set     — create or update a registry entry
  get     — show one registry entry
  list    — show all registry entries
  remove  — delete a registry entry (alias: rm)
`

export const configSetHelpText = `
Examples:
  $ rk config set @rack --url https://registry.rackjs.com
  $ rk config set @corp --url https://r.corp.com --token TKN
  $ rk config set @corp --header "X-Api-Key: abc" --header "Accept: application/json"
  $ rk config set @corp --token TKN      # update token, keep existing URL / headers

Notes:
  - --token is injected as "Authorization: Bearer <token>" at request time.
  - --header can be repeated; format must be exactly "Key: Value".
  - At least one of --url, --token, --header is required.
`

export const configGetHelpText = `
Examples:
  $ rk config get @rack
  $ rk config get @rack --json       # machine-readable; recommended for AI tools
`

export const configListHelpText = `
Examples:
  $ rk config list
  $ rk config list --json            # machine-readable; recommended for AI tools
`

export const configRemoveHelpText = `
Examples:
  $ rk config remove @corp
  $ rk config rm @corp               # short alias
  $ rk config remove @corp -f        # skip confirmation

Notes:
  - The built-in @rack and @presets namespaces cannot be removed.
`
