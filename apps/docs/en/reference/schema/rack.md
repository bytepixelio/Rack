---
aside: false
---

# rack.json

`rack.json` is the project configuration file that defines the project's language, template, registry sources, and other information.

## Example

```json
{
  "$schema": "https://registry.rackjs.com/schemas/rack.json",
  "name": "my-project",
  "language": "ts",
  "template": "react-tutorial-project",
  "items": [
    "runtimes/node@1.0.0",
    "build/vite",
    "frameworks/react"
  ]
}
```

## Field Descriptions

### `$schema`

- **Type**: `string`
- **Required**: No
- **Description**: Schema URL

```json
{
  "$schema": "https://registry.rackjs.com/schemas/rack.json"
}
```

### `name`

- **Type**: `string`
- **Required**: Yes
- **Description**: Project name

```json
{
  "name": "my-project"
}
```

### `language`

- **Type**: `string` (`"js"` | `"ts"`)
- **Required**: No
- **Description**: Project language

**Allowed values**:

- `"ts"` - TypeScript
- `"js"` - JavaScript

```json
{
  "language": "ts"
}
```

### `template`

- **Type**: `string`
- **Required**: No
- **Description**: Template name used

```json
{
  "template": "react-tutorial-project"
}
```

### `items`

- **Type**: `string[]`
- **Required**: No
- **Description**: List of installed registries; version can be specified

**Format**:

- Full format: `@namespace/name` or `@namespace/name@version` (for non-`@rack` namespaces)
- Shorthand format: `name` or `name@version` (CLI will automatically resolve to `@rack/name`, recommended for `@rack` registries)

**Version format** (follows semver):

- Exact version: `runtimes/node@1.0.0` or `@rack/runtimes/node@1.0.0`
- Without version: `runtimes/node` (uses latest version)

```json
{
  "items": [
    "runtimes/node@1.0.0",
    "build/vite",
    "frameworks/react"
  ]
}
```
