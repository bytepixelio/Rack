# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Rack is a registry-based project scaffolding tool. Developers compose JSON-defined modules (registries) hosted on a static file server to scaffold projects via `rk init` and `rk add`.

## Repo layout

pnpm monorepo managed by Turborepo. Apps under `apps/`, shared content under `packages/`. `pnpm-workspace.yaml` registers both.

| Path                   | What it is                                                                                               | Read this for details                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `apps/cli`             | `rackjs-cli` — the `rk` CLI                                                                              | [README](apps/cli/README.md), [ARCHITECTURE](apps/cli/docs/ARCHITECTURE.md)                         |
| `apps/registry-server` | `@rack/registry-server` — Fastify 5 static file server                                                   | [README](apps/registry-server/README.md), [ARCHITECTURE](apps/registry-server/docs/ARCHITECTURE.md) |
| `apps/registry-worker` | `@rack/registry-worker` — Cloudflare Worker mirroring the read-only API over R2                          | [README](apps/registry-worker/README.md), [ARCHITECTURE](apps/registry-worker/docs/ARCHITECTURE.md) |
| `apps/e2e`             | `@rack/e2e` — end-to-end tests (real CLI binary against in-process server)                               | [README](apps/e2e/README.md)                                                                        |
| `apps/docs`            | VitePress documentation site                                                                             | `pnpm docs` to run locally                                                                          |
| `packages/storage`     | Flat-file registry data + JSON schemas (`registry-item.json`, `preset.json`, `rack.json`)                | Inspect `packages/storage/schema/` for authoritative schemas                                        |
| `packages/auth-core`   | `@rack/auth-core` — shared namespace-token auth (parser + `verifyAccess`) used by both server and worker | Inspect `packages/auth-core/src/`                                                                   |
| `config/auth.json`     | Single source of truth for namespace/token policy; Worker reads a synced copy from R2                    | See server and worker READMEs for the auth model                                                    |

The CLI install pipeline (fetch → resolve deps → conflict check → sort → apply files → merge `package.json`), error model (`AppError` + `[CODE]` + `Hint:`), merge engine, and module dependency graph are all documented in `apps/cli/docs/ARCHITECTURE.md`. Server routes, env-var config, auth, and webhook delivery are in `apps/registry-server/README.md`. Don't duplicate that content here — read it on demand.

## Commands

**Package manager:** pnpm only — never `npm` / `yarn`.

```bash
pnpm install           # bootstrap
pnpm dev               # all apps
pnpm build             # all apps
pnpm test              # all apps
pnpm test:e2e          # end-to-end tests (apps/e2e, runs CLI against real server)
pnpm typecheck         # tsc --noEmit per package (via turbo)
pnpm lint              # eslint . across the repo
pnpm format:check      # prettier --check .
pnpm format            # prettier --write .
pnpm clean             # clear build artifacts and node_modules
pnpm commit            # commitizen — Conventional Commits enforced by commitlint
```

Single-app filter and specific test:

```bash
pnpm --filter rackjs-cli dev
pnpm --filter rackjs-cli test -- tests/lib/pipeline           # from project root
cd apps/cli && pnpm test -- tests/lib/commands/init          # from app dir
```

## Release

[Changesets](https://github.com/changesets/changesets) manages versioning. `pnpm changeset` to create a changeset, push to main, merge the auto-created "Version Packages" PR → npm publish runs automatically via GitHub Actions.

```bash
pnpm changeset          # create a changeset (select package, bump type, summary)
```

Push to main triggers `.github/workflows/ci.yml`: build → typecheck → lint → format:check → test → e2e → changesets (version PR or npm publish).

## Code style (project-specific additions)

General code style (ESM + `.js`, import sort, no over-abstraction, no unused imports, Conventional Commits, etc.) lives in `~/.claude/CLAUDE.md`. The rules below are Rack-specific on top of that.

- **Type-check command:** `pnpm typecheck` after writing code — runs `tsc --noEmit` per package via turbo. Every package's tsconfig has `noUnusedLocals` / `noUnusedParameters` enabled, so unused imports/variables fail typecheck.
- **CLI tests must keep 100 % line/function/branch/statement coverage** on `src/**/*.ts` (enforced by `apps/cli/vitest.config.ts`). Server and e2e have no such threshold — e2e is protocol-level, not unit-level.
- ESLint (`pnpm lint` = `eslint .`) and Prettier (`pnpm format:check` / `pnpm format`) cover the whole repo from the root flat `eslint.config.js` and `.prettierrc`. Husky `pre-commit` runs `lint-staged` (prettier + eslint --fix on staged files); `commit-msg` runs commitlint. Conventional Commits enforced via `pnpm commit` (commitizen) too.

## Where to look for X

| Question                                                  | File                                      |
| --------------------------------------------------------- | ----------------------------------------- |
| What does `rk <cmd>` do / its flags?                      | `apps/cli/README.md` or `rk <cmd> --help` |
| What's the install pipeline / merge engine / error model? | `apps/cli/docs/ARCHITECTURE.md`           |
| What env vars / API routes does the server expose?        | `apps/registry-server/README.md`          |
| Schema for `registry.json` / `preset.json` / `rack.json`? | `packages/storage/schema/*.json`          |
| Identifier syntax (`@ns/path@ver:lang`)?                  | `apps/docs/{en,zh}/guide/` or `rk --help` |
| User-facing CLI reference (en/zh)?                        | `apps/docs/{en,zh}/reference/cli.md`      |
| E2E test structure / how to add coverage / `smoke.json`?  | `apps/e2e/README.md`                      |
