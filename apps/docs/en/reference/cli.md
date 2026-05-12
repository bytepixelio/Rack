---
aside: false
---

# Command Line Interface

## `rk init`

Initialize a new project from a template or a single registry.

This command prompts for the project name, validates the target directory, runs the install pipeline, generates `rack.json`, and optionally installs dependencies and initializes Git. `-t/--template` is required.

### Usage

```bash
rk init -t <template> [-n <project-name>] [--ci] [-f] [--skip-install] [--skip-git]
```

### Options

| Option                      | Description                                                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `-t, --template <template>` | **Required.** Template ID, e.g. `@presets/node` or a single registry identifier                                   |
| `-n, --name <project-name>` | Single safe path segment for the project name (interactive prompt when omitted; pass `.` to init the current dir) |
| `-f, --force`               | Allow init into an existing target directory (no cleanup; conflicts resolved by each registry's merge strategy)   |
| `--ci`                      | Run in CI mode (non-interactive; also skips dependency install and Git init; `-n` is required)                    |
| `--skip-install`            | Skip dependency installation                                                                                      |
| `--skip-git`                | Skip Git repository initialization                                                                                |

## `rk add`

Apply a specified registry to an existing project.

### Usage

```bash
rk add <registry>
```

> If the current directory does not have `rack.json`, `rk add` automatically generates a minimal configuration based on the directory name before continuing. Preset identifiers (starting with `@presets/`) are not allowed via `rk add` — use `rk init -t` instead. Already-installed registries are skipped (idempotent).

### Example

```bash
rk add runtimes/node

# Output (example):
# ✓ Added registry runtimes/node
# • Files: src/index.ts
# • Dependencies: typescript@^5.5.0
```

## `rk list`

Discover namespaces and registries available on a registry server. Intended as the starting point when you do not yet know what can be installed — especially useful for AI tools that need to enumerate available modules before calling `rk add`.

### Usage

```bash
rk list [namespace] [--json] [--registry <namespace>]
```

### Arguments & options

| Argument / option        | Description                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| `[namespace]`            | Namespace to list registries for (e.g. `@rack`). Omit to list all namespaces on the server.        |
| `--json`                 | Emit machine-readable JSON to stdout. Recommended for AI / scripted callers.                       |
| `--registry <namespace>` | Registry namespace to query (default: `@rack`). Use when multiple registry servers are configured. |

### Examples

```bash
# List namespaces on the default registry
rk list

# List registries under a specific namespace
rk list @rack

# Machine-readable output
rk list @rack --json
```

### Typical discovery flow

```bash
rk list --json                 # 1. find namespaces
rk list @rack --json           # 2. find registries in a namespace
rk add @rack/<name>            # 3. install one
```

Internally `rk list` calls the registry server's `GET /namespaces` and `GET /namespaces/:namespace/registries` endpoints. Credentials and headers configured via `rk config set` are forwarded automatically.

## `rk config`

Manage local registry source configuration (defaults to `~/.rackrc`).

### Usage

```bash
rk config <subcommand>
```

### Subcommands

| Subcommand              | Alias | Description                                                                          | Example                               |
| ----------------------- | ----- | ------------------------------------------------------------------------------------ | ------------------------------------- |
| `rk config list`        | `ls`  | Display all configured registry sources                                              | `rk config list`                      |
| `rk config get <ns>`    | -     | View details for a specific namespace                                                | `rk config get @rack`                 |
| `rk config set <ns>`    | -     | Add or update registry source configuration                                          | `rk config set @internal --url <url>` |
| `rk config remove <ns>` | `rm`  | Remove registry source configuration (requires confirmation unless `-f` is provided) | `rk config remove @internal`          |

#### `list` Subcommand Options

| Option   | Description                                                      |
| -------- | ---------------------------------------------------------------- |
| `--json` | Output all configurations in JSON format (for script processing) |

#### `get` Subcommand Options

| Option   | Description                                                 |
| -------- | ----------------------------------------------------------- |
| `--json` | Output configuration in JSON format (for script processing) |

#### `set` Subcommand Options

| Option                 | Description                                                              |
| ---------------------- | ------------------------------------------------------------------------ |
| `--url <url>`          | Registry server address                                                  |
| `--token <token>`      | Authentication token                                                     |
| `--header <header...>` | Custom request header in `Key: Value` format; can be used multiple times |

After setting the configuration, the command prints the new entry. `--token` is stored as a separate `token` field on disk; both `rk config get/list` output and outgoing HTTP requests expand it into an `Authorization: Bearer <token>` header.

#### `remove` Subcommand Options

| Option        | Description                       |
| ------------- | --------------------------------- |
| `-f, --force` | Skip deletion confirmation prompt |

#### Security Notes

- **Namespace format**: must start with `@`; the default `@rack` namespace cannot be removed.
- **Credentials are printed in cleartext**: `rk config get/list` does **not** mask tokens or sensitive headers in the current version. Protect your `~/.rackrc` and terminal output accordingly.

### Examples

```bash
# Configure private registry
rk config set @internal --url https://registry.company.com --token abc123xyz789
# Output:
# ✓ Registry @internal configured successfully
#
# Configuration for @internal:
#   URL:      https://registry.company.com
#   Headers:
#     Authorization -> Bearer abc123xyz789

# Add custom request headers
rk config set @internal --url https://registry.company.com \
  --header "X-API-Version: v2" \
  --header "X-Environment: production"
# Output:
# ✓ Registry @internal configured successfully
#
# Configuration for @internal:
#   URL:      https://registry.company.com
#   Headers:
#     X-API-Version -> v2
#     X-Environment -> production

# View configuration (token is expanded as an Authorization Bearer header)
rk config get @internal
# Output:
# Configuration for @internal:
#   URL:      https://registry.company.com
#   Headers:
#     Authorization -> Bearer abc123xyz789
#     X-API-Version -> v2
#     X-Environment -> production

# JSON output
rk config get @internal --json

# List all configurations
rk config list
# Output:
# Configuration for @rack:
#   URL:      https://registry.rackjs.com
# Configuration for @internal:
#   URL:      https://registry.company.com
#   Headers:
#     Authorization -> Bearer abc123xyz789
#     X-API-Version -> v2
#     X-Environment -> production

# List all configurations in JSON format
rk config list --json

# Remove configuration (requires confirmation)
rk config remove @internal
# Output (if confirmed):
# ✓ Registry @internal removed successfully
# Output (if cancelled):
# Operation cancelled

# Force remove (skip confirmation)
rk config remove @internal -f
# Output:
# ✓ Registry @internal removed successfully
```

## `rk doctor`

Diagnose environment.

### Usage

```bash
rk doctor [options]
```

### Options

| Option   | Description                                                     |
| -------- | --------------------------------------------------------------- |
| `--json` | Output diagnostic results in structured JSON for CI consumption |

### Description

- Three categories run in parallel:
  - **environment**: Node.js version against `engines.node`, `git` availability on `PATH`
  - **project**: `rack.json` validity and the count of installed registries
  - **remote**: `/health` probe for every namespace in `~/.rackrc`
- Levels are `info` / `warning` / `error`; any `error` triggers a non-zero exit code.
- Default output is a grouped text summary; pass `--json` for structured output suitable for CI.

## `rk version`

Display the current CLI version information.

### Usage

```bash
rk version
```

### Output

- Rack CLI version
- Node.js runtime version and platform (e.g., `darwin/arm64`)
- Absolute path to `~/.rackrc`

```bash
rk version
# Version: 1.0.0
# Node.js: v22.10.0
# Platform: darwin/arm64
# Config: /Users/me/.rackrc
```
