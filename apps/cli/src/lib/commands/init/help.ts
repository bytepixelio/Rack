/**
 * Additional `--help` text for the `rk init` command.
 *
 * Rendered by Commander after the auto-generated options block.
 * Content is optimized for AI consumers (Claude Code, Codex, etc.):
 * concrete examples, preconditions, and error hints they cannot
 * infer from option names alone.
 */

export const initHelpText = `
Examples:
  $ rk init -t @presets/node -n my-app
  $ rk init -t @rack/runtimes/node --ci -n svc          # CI mode requires -n
  $ rk init -t @presets/node-library -n my-lib -f       # allow init into an existing dir (no cleanup)
  $ rk init -t @presets/node -n s --skip-install --skip-git  # scaffold only

Template identifier:
  -t accepts either a preset (@presets/<path>) or a single registry
  (@<namespace>/<path>[@<version>][:<language>]). Examples:
    @presets/node
    @rack/runtimes/node
    @rack/runtimes/node@1.0.0
    @rack/runtimes/node:ts         # force TypeScript variant (ts | js)

Notes:
  - Without --ci you will be prompted for the project name if -n is omitted.
  - With --ci you must pass -n explicitly; init fails fast otherwise.
  - -n/--name must be a single safe path segment (e.g. 'my-app').
    "/", "\\", "..", and absolute paths are rejected; use "." to init
    into the current directory instead.
  - -f/--force only allows init into an existing directory; it does NOT
    clean the directory. Conflicting files are resolved per-file by each
    registry's merge strategy (overwrite, json, env, ignore, custom).
  - rack.json is written before install; the step is safe to re-run.
  - Dependency install and git init failures become warnings, not fatal.
`
