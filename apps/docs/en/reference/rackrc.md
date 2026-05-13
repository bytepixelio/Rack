---
aside: false
---

# Configuration File

Rack uses `~/.rackrc` to manage registry source URLs and access credentials. This configuration applies to all projects for the current user.

## Configuration Structure

`.rackrc` is a JSON file that currently supports the following top-level fields:

```json
{
  "registries": {
    "@rack": "https://registry.rackjs.com"
  }
}
```

### registries

Uses namespaces as keys to declare access endpoints for each registry. Values can be either a string or an object:

- **String**: declares only the registry URL.
- **Object**: at minimum contains `url`; optionally `headers` (custom request headers) and `token` (Bearer token).

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

> The `token` field is stored separately on disk. The CLI expands it into an `Authorization: Bearer <token>` header only when resolving the entry or sending a request — it is not written back into `headers`. If `headers` already contains an explicit `Authorization` entry, it is overwritten by the expanded token value.

### Common Use Cases

- Add enterprise internal registries: declare self-hosted addresses for `@company` or other private namespaces.
- Set access tokens: use the `token` field directly, or pass a PAT / API Key via custom request headers.
- Customize requests: add `X-` prefixed headers to control auditing, versioning, or multi-tenant routing.

## Managing with CLI

It's recommended to use the `rk config` command to maintain `.rackrc` and avoid format errors from manual editing.

### Basic Commands

- View all configuration: `rk config list` (alias: `ls`)
- Query specific namespace: `rk config get @namespace [--json]`
- Add or update source: `rk config set @namespace --url <url> [--token <token>] [--header "Key: Value"]`
- Remove source: `rk config remove @namespace` (alias: `rm`, use `-f` to skip confirmation)

### Advanced Features

- **Incremental updates**: `set` merges with the existing entry; fields not provided are preserved. `--header` adds onto existing `headers`, with same-key entries replaced.
- **Token shorthand**: `--token` is stored as a separate `token` field and expanded into `Authorization: Bearer <token>` for both display and outgoing requests.
- **Namespace protection**: the built-in `@rack` and `@presets` namespaces cannot be removed; `set/get/remove` only check that a namespace starts with `@`, and the full regex is enforced when `rk init` / `rk add` parse identifiers. `@presets` defaults to the same registry root as `@rack` (§6.16); unknown namespaces no longer fall back — they raise `REGISTRY_NOT_FOUND`.

> The current version of `rk config get/list` does not mask tokens or sensitive headers, and `rk config set` does not perform a connectivity probe on `--url`. Use `rk doctor` if you want to verify a source is reachable.

## Manual Editing and Validation

If you need to modify `.rackrc` directly, follow this recommended workflow:

```bash
# Open the file
vi ~/.rackrc

# Quick check after saving
rk config list
```

- Maintain standard JSON; comments are not supported.
- Create the directory in advance and restrict permissions to avoid leaking access tokens.
- In CI environments, you can write a temporary `.rackrc` and run `rk config list` to validate the configuration is working.
