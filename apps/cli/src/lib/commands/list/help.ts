/**
 * Additional `--help` text for the `rk list` command.
 */

export const listHelpText = `
Examples:
  $ rk list                          # list namespaces on the default registry
  $ rk list @rack                    # list registries in the @rack namespace
  $ rk list @rack --json             # machine-readable; recommended for AI tools

Registry source:
  Without --registry, the default namespace (@rack) in ~/.rackrc is used.
  Use --registry to target a specific namespace when you have several configured.

Typical use:
  1. rk list --json                  → discover available namespaces
  2. rk list @rack --json            → discover registries in @rack
  3. rk add @rack/<name>             → install one
`
