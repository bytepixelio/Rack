/**
 * Additional `--help` text for the `rk add` command.
 */

export const addHelpText = `
Examples:
  $ rk add @rack/tailwindcss
  $ rk add @rack/tailwindcss@1.2.0           # pin a version
  $ rk add @company/internal-feature         # custom namespace (see rk config set)

Registry identifier:
  @<namespace>/<path>[@<version>][:<language>]
    @rack/runtimes/node
    @rack/runtimes/node@1.0.0
    @rack/vue:ts                   # force TypeScript variant (ts | js)

Preconditions:
  - Current directory must contain a rack.json (created by 'rk init').
  - Namespace must be configured in ~/.rackrc (see 'rk config set').

Errors you may see:
  REGISTRY_NOT_FOUND   — unknown identifier or namespace not configured
  CONFLICT             — incompatible with a registry already installed
  CIRCULAR_DEPENDENCY  — dependency cycle in registryDependencies
  INVALID_NAMESPACE    — identifier does not match the required format
`
