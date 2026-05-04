---
aside: false
---

# Namespaces

Namespaces are used to distinguish and manage registries from different sources.

## What Are Namespaces?

A namespace is the first part of a registry ID, starting with the `@` symbol, indicating the registry's source.

```
@namespace/path/to/registry
   ↑          ↑
Namespace   Registry path
```

**Examples**

- `@company/ui-kit` - `@company` is the namespace, `ui-kit` is the path
- `@company/runtimes/node` - `@company` is the namespace, `runtimes/node` is the path
- `@team/internal-config` - `@team` is the namespace, `internal-config` is the path

## Why Namespaces?

Namespaces give different registry sources independent resolution and access:

- **Source mapping**: each namespace has its own URL and auth (e.g. `@rack` → official, `@company` → internal).
- **Conflict avoidance**: registries with the same name but different namespaces coexist (`@official/ui-kit` and `@company/ui-kit`).
- **Access control**: the server enforces tokens and publish permissions per namespace, so teams stay isolated.

::: tip Official Registry Shorthand
Official registries can omit the `@rack` prefix and use forms like `runtimes/node`, `frameworks/vue` (CLI automatically resolves to `@rack/runtimes/node`).
:::

## Namespace Format

Namespaces must comply with the following rules (enforced by the CLI when parsing identifiers):

- Start with `@`
- Only lowercase letters, digits, `-`, and `_` are allowed (uppercase is lowercased before validation)
- The first and last characters must be a lowercase letter or digit
- No spaces or other special characters

> Regex: `^@[a-z0-9](?:[a-z0-9-_]*[a-z0-9])?$`

**Valid namespaces**

```
✓ @rack
✓ @company
✓ @my-org
✓ @internal_team
✓ @org2024
```

**Invalid namespaces**

```
✗ rack           # Missing @
✗ @my org        # Contains space
✗ @-company      # Cannot start with -
✗ @company!      # Contains special character
✗ @_internal     # Cannot start with _
✗ @internal_     # Cannot end with _
```

> `rk config set/get/remove` only checks the leading `@`; the full regex above is enforced when `rk init` / `rk add` parse identifiers.

## Official Registries and Shorthand

Official registries live under `@rack`, organised by [Registry Types](/guide/registry#registry-types) (`runtimes/`, `frameworks/`, `build/`, ...). The shorthand form (omitting `@rack/`) is automatically expanded by the CLI.

```bash
rk add @rack/runtimes/node     # Full form
rk add runtimes/node           # Shorthand, equivalent to the line above
```

## Configure Namespace Sources

### Default Configuration

Rack uses the official source by default; the configuration file lives at `~/.rackrc`.

```json
{
  "registries": {
    "@rack": "https://registry.rackjs.com"
  }
}
```

All namespaces not explicitly configured fall back to the `@rack` source.

### Add Private Source

Enterprises can configure private namespaces to point to internal registry servers.

```bash
rk config set @company --url https://registry.company.com
```

Configuration after adding:

```json
{
  "registries": {
    "@rack": "https://registry.rackjs.com",
    "@company": "https://registry.company.com"
  }
}
```

### Private Source with Authentication

Add authentication for private sources.

```bash
rk config set @company --url https://registry.company.com --token your-token-here
```

You can also pass custom headers directly via `--header "Key: Value"`.

```bash
rk config set @company --url https://registry.company.com \
  --header "X-API-Version: v2"
```

**Configuration result (~/.rackrc)**

`--token` is stored as a separate `token` field. The CLI expands it into an `Authorization: Bearer <token>` header only when displaying the entry or sending a request — it is **not** written back into `headers`.

```json
{
  "registries": {
    "@rack": "https://registry.rackjs.com",
    "@company": {
      "url": "https://registry.company.com",
      "headers": {
        "X-API-Version": "v2"
      },
      "token": "your-token-here"
    }
  }
}
```

### View Configured Namespaces

```bash
rk config list
```

**Example output (token is printed in cleartext as an Authorization Bearer header)**

```
Configuration for @rack:
  URL:      https://registry.rackjs.com
Configuration for @company:
  URL:      https://registry.company.com
  Headers:
    Authorization -> Bearer your-token-here
    X-API-Version -> v2
```

> The current version does not mask tokens or sensitive headers. Protect your `~/.rackrc` and terminal output.

### Remove Namespace Configuration

```bash
# Alias: rm; pass -f to skip confirmation
rk config remove @company
```

After removal, the namespace falls back to the default `@rack` source. The default `@rack` namespace cannot be removed.

## Namespace Resolution Rules

When running `rk add @namespace/name`, Rack searches for configuration in the following order.

#### 1. Exact Match

Prioritize the configuration that exactly matches the namespace.

```bash
# Configuration
{
  "@company": "https://registry.company.com"
}

# Command
rk add @company/ui-kit
# → Uses https://registry.company.com
```

#### 2. Fall Back to Default Source

If the namespace is not configured, fall back to the `@rack` source.

```bash
# Configuration
{
  "@rack": "https://registry.rackjs.com"
}

# Command (shorthand form)
rk add frameworks/vue
# → Shorthand, automatically resolved to @rack
# → Final URL: https://registry.rackjs.com/registries/@rack/frameworks/vue
```

## Registry URL Structure

Rack builds URLs from the namespace configuration and the registry path; both the `/registries/` prefix and the namespace segment are preserved in the URL.

```
Registry ID:  @namespace/path/to/name@version
Config map:   @namespace → {host}
Final URL:    {host}/registries/{@namespace}/{path}[/{version}]
```

> The URL does not end with `/registry.json` — the Server / Worker maps the request to the underlying `registry.json` content and returns JSON. When the registry ID has no version, the URL also drops the version segment; once the CLI receives the response, it uses `item.version` to build the actual download URL for template files.

**Official registry example**

```bash
# Registry ID
runtimes/node

# Source configuration
@rack → https://registry.rackjs.com

# Final URL (the shorthand omits the namespace, but it is restored to @rack)
https://registry.rackjs.com/registries/@rack/runtimes/node
```

**Enterprise registry example**

```bash
# Without version
Registry ID:  @company/ui-kit
Final URL:    https://registry.company.com/registries/@company/ui-kit

# With version
Registry ID:  @company/runtimes/node@1.2.3
Final URL:    https://registry.company.com/registries/@company/runtimes/node/1.2.3
```

## Troubleshooting

#### Authentication Failure

**Error message**

```
Error: 401 Unauthorized
```

**Solution**

Check if the token has expired and update authentication information.

```bash
rk config set @company --url https://registry.company.com --token new-token-here
```

#### Namespace Conflict

**Error message**

```
Warning: Namespace @company is already configured
```

**Solution**

Using `rk config set` will automatically override the existing configuration, or remove it first.

```bash
rk config remove @company
rk config set @company --url https://new-registry.company.com
```
