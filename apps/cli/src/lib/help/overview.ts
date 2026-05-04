/**
 * Top-level `--help` overview for the `rk` program.
 *
 * Appended after Commander's auto-generated usage/options/commands block.
 * Content is optimized for AI consumers: core concepts and identifier
 * syntax that cannot be inferred from subcommand names alone.
 */

export const overviewHelpText = `
Core concepts:
  - Registry: a reusable module defined by registry.json (runtime, framework,
    build tool, feature, testing setup, quality tools).
  - Preset:   a curated bundle of registries, composed into a ready-to-scaffold
    project template.

Identifier syntax:
  @<namespace>/<path>[/<subpath>...][@<version>][:<language>]
    @rack/tailwindcss
    @rack/runtimes/node@1.0.0
    @rack/vue:ts                   # force TypeScript variant
    @presets/tutorial-project

  Namespaces:  @[a-z0-9][a-z0-9-_]*[a-z0-9]   (configure via 'rk config set')
  Path segments: [a-z0-9-]+
  Language:    ts | js  (optional; overrides registry's defaultLanguage)

  Identifiers without a namespace default to @rack
  (e.g. 'tailwindcss' is resolved as '@rack/tailwindcss').

Typical flow:
  $ rk init -t @presets/tutorial-project -n my-app
  $ cd my-app
  $ rk add @rack/tailwindcss

Config:
  ~/.rackrc (JSON) holds registry URLs, tokens, and headers.
  Use 'rk config list --json' to inspect from a script.

Discovery:
  $ rk list                       # list namespaces on the default registry
  $ rk list @rack                 # list registries under a namespace
  $ rk list @rack --json          # machine-readable; recommended for AI tools

Troubleshooting:
  $ rk doctor --json        # environment + connectivity report
`
