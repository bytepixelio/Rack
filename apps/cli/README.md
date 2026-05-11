# Rack CLI

Command-line tool for the Rack project scaffolding system. Combines JSON-defined registry modules hosted on a registry server to initialize or extend projects.

## Quick start

```bash
# Install dependencies (repository root)
pnpm install

# Development
pnpm --filter rackjs-cli dev -- <args>

# Build
pnpm --filter rackjs-cli build

# Test
pnpm --filter rackjs-cli test
```

Once built and linked globally, invoke as `rk`.

## Commands

| Command      | Description                                                           |
| ------------ | --------------------------------------------------------------------- |
| `rk init`    | Initialize a new project from a template (preset or single registry). |
| `rk add`     | Add a single registry to an existing project.                         |
| `rk list`    | Discover namespaces and registries on a registry server.              |
| `rk config`  | Manage registry configuration stored in `~/.rackrc`.                  |
| `rk doctor`  | Diagnose environment, project, and registry connectivity.             |
| `rk version` | Print CLI version, Node.js version, platform, and config path.        |

### `rk init`

```bash
rk init -t <template> [-n <name>] [--ci] [-f] [--skip-install] [--skip-git]
```

| Flag             | Description                                              |
| ---------------- | -------------------------------------------------------- |
| `-t, --template` | **Required.** Preset or registry identifier to scaffold. |
| `-n, --name`     | Project name (interactive prompt when omitted).          |
| `--ci`           | Non-interactive mode; also skips install and git init.   |
| `-f, --force`    | Overwrite an existing target directory.                  |
| `--skip-install` | Skip `npm install` after scaffolding.                    |
| `--skip-git`     | Skip `git init`.                                         |

```bash
rk init -t @presets/vue-ts -n my-app
rk init -t @presets/node-api -n server --ci
```

Flow: prompt name → validate target dir → pipeline (fetch + resolve + sort + apply) → write `rack.json` → `npm install` → `git init` → report.

### `rk add`

```bash
rk add <registry>
```

| Argument     | Description                                                     |
| ------------ | --------------------------------------------------------------- |
| `<registry>` | Registry identifier (e.g. `@rack/tailwindcss`, `@rack/vue:ts`). |

```bash
rk add @rack/tailwindcss
rk add @rack/vitest
```

Presets (`@presets/...`) are rejected — use `rk init -t` instead. Idempotent: already-installed registries are skipped. Updates `rack.json` on success.

### `rk list`

```bash
rk list [namespace] [--json] [--registry <namespace>]
```

| Argument / flag          | Description                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `[namespace]`            | Namespace to list registries for (e.g. `@rack`). Omit to list all namespaces.            |
| `--json`                 | Emit machine-readable JSON to stdout. Recommended for AI / scripted callers.             |
| `--registry <namespace>` | Registry namespace to query (default: `@rack`). Use when several servers are configured. |

```bash
rk list                       # list namespaces on the default registry
rk list @rack                  # list registries in the @rack namespace
rk list @rack --json           # machine-readable output
```

Calls the registry server's `GET /namespaces` and `GET /namespaces/:namespace/registries` endpoints. Typical discovery flow: `rk list --json` → `rk list <ns> --json` → `rk add <ns>/<name>`.

### `rk config`

```bash
rk config set <namespace> [--url <url>] [--token <token>] [--header <"Key: Value">...]
rk config get <namespace> [--json]
rk config list [--json]
rk config remove <namespace> [-f]   # alias: rm
```

`set` merges with existing entries rather than replacing them. `remove` refuses to delete the default `@rack` namespace. Sensitive values are printed as-is (not masked); keep `~/.rackrc` private.

### `rk doctor`

```bash
rk doctor [--json]
```

Three check categories:

| Category      | What it checks                                              |
| ------------- | ----------------------------------------------------------- |
| `environment` | Node.js version (must match `engines.node`), `git` on PATH. |
| `project`     | `rack.json` validity; count of installed registries.        |
| `remote`      | `/health` probe of every configured registry.               |

Levels: `info` / `warning` / `error`. Exits `1` when any `error` is present.

### `rk version`

```bash
rk version
```

Prints CLI version, Node.js version, platform (`os/arch`), and `~/.rackrc` path.

## Configuration

### `~/.rackrc`

Global CLI config. JSON; missing file falls back to defaults.

```json
{
  "registries": {
    "@rack": "https://registry.rackjs.com",
    "@company": {
      "url": "https://registry.company.com",
      "token": "bearer-token",
      "headers": { "X-Trace-Id": "rack-cli" }
    }
  }
}
```

- A bare string is a URL-only entry
- `token` is translated into `Authorization: Bearer <token>`
- Custom `headers` merge with the Bearer header
- The `@rack` namespace is always seeded with the default URL

### Identifier format

`@namespace/path@version:language` — all segments except `path` are optional.

| Example                 | namespace  | path            | version  | language |
| ----------------------- | ---------- | --------------- | -------- | -------- |
| `node-ts`               | `@rack`    | `node-ts`       | —        | —        |
| `@rack/runtimes/node`   | `@rack`    | `runtimes/node` | —        | —        |
| `nextjs@14.0.0`         | `@rack`    | `nextjs`        | `14.0.0` | —        |
| `@company/app@1.0.0:ts` | `@company` | `app`           | `1.0.0`  | `ts`     |
| `@presets/vue-ts`       | `@presets` | `vue-ts`        | —        | —        |

Remote URL pattern: `{base}/registries/{namespace}/{path}/{version}` (registry) and `{base}/presets/{name}` (preset, single-segment name only). Template files are served at `{base}/registries/{namespace}/{path}/{version}/files/*`.

### `rack.json`

Per-project manifest generated by `rk init`.

```json
{
  "$schema": "https://registry.rackjs.com/schemas/rack.json",
  "name": "my-project",
  "language": "ts",
  "template": "@presets/vue-ts",
  "items": ["@rack/node-ts", "@rack/vue", "@rack/tailwindcss"]
}
```

Required: `name`. Everything else is optional and appears only when set.

## Requirements

- Node.js ≥ 22.10.0 (enforced via `engines.node`)
- pnpm (repository-level package manager)

## Project layout

```
src/
├── bin.ts                     # Executable entry (shebang, fatal error handler)
├── cli.ts                     # Commander program assembly
├── constants.ts               # DEFAULT_NAMESPACE, DEFAULT_REGISTRY_URL
└── lib/
    ├── infra/                 # Infrastructure adapters
    │   ├── fs.ts              #   node:fs/promises wrappers
    │   ├── http.ts            #   Axios + axios-retry
    │   ├── logger.ts          #   Level-based console logger
    │   └── prompts.ts         #   prompts + ora wrapper
    ├── utils/                 # Pure helpers
    │   ├── errors.ts          #   Error classes + getErrorMessage
    │   ├── error-hints.ts     #   Code → actionable next-step hint
    │   └── version.ts         #   CLI version + min Node version
    ├── help/                  # Top-level --help overview text
    │   └── overview.ts        #   Identifier syntax, flow, discovery
    ├── rackrc.ts              # ~/.rackrc read/write
    ├── rack-json.ts           # rack.json read/write
    ├── git.ts                 # git init
    ├── pkg.ts                 # package.json merge + npm install
    ├── registry/              # Remote registry client
    │   ├── client.ts          #   fetchItem / fetchPreset / fetchFile*
    │   ├── identifier.ts      #   parseNamespace / isPreset
    │   └── types.ts           #   RegistryItem / Preset / Language
    ├── pipeline/              # Install pipeline phases
    │   ├── apply.ts           #   Write files using merge strategies
    │   ├── conflict.ts        #   validateNoConflicts
    │   ├── resolve-dependencies.ts  # BFS across registryDependencies
    │   ├── resolve-versions.ts      # npm version conflict resolution
    │   ├── sort.ts            #   Topological + priority sort
    │   ├── types.ts           #   PipelineContext / PipelineResult
    │   └── merge/             #   File-merge engine
    │       ├── index.ts       #     merge() dispatch + resolveStrategy
    │       ├── strategies.ts  #     json / ignore / env / overwrite
    │       └── plugin-loader.ts     # Custom async plugin loader
    └── commands/              # CLI command layer
        ├── add/               #   rk add
        ├── init/              #   rk init
        ├── list/              #   rk list
        ├── config/            #   rk config {set,get,list,remove}
        ├── doctor/            #   rk doctor
        └── version/           #   rk version

    Each command directory has its own index.ts (registration),
    help.ts (addHelpText block), and when applicable display.ts
    (chalk / logger presentation).
```

For architecture, pipeline phases, and dependency flow, see [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).
