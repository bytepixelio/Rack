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
  $ rk init -t @presets/tutorial-project -n my-app
  $ rk init -t @rack/runtimes/node --ci -n svc        # CI mode requires -n
  $ rk init -t @presets/nextjs-app -f                  # overwrite existing dir
  $ rk init -t @presets/x --skip-install --skip-git    # scaffold only

Template identifier:
  -t accepts either a preset (@presets/<path>) or a single registry
  (@<namespace>/<path>[@<version>][:<language>]). Examples:
    @presets/tutorial-project
    @rack/runtimes/node
    @rack/runtimes/node@1.0.0
    @rack/vue:ts                   # force TypeScript variant (ts | js)

Notes:
  - Without --ci you will be prompted for the project name if -n is omitted.
  - rack.json is written before install; the step is safe to re-run.
  - Dependency install and git init failures become warnings, not fatal.
`
