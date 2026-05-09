---
aside: false
---

# preset.json

`preset.json` is a preset configuration file that defines a predefined combination of registries for quick project initialization.

## Example

```json
{
  "$schema": "https://registry.rackjs.com/schemas/preset.json",
  "name": "react-tutorial-project",
  "version": "1.0.0",
  "description": "React tutorial project preset with TypeScript, Vite, React Router, etc.",
  "author": "John Doe",
  "tags": ["react", "tutorial", "typescript"],
  "registries": [
    "runtimes/node",
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
  "$schema": "https://registry.rackjs.com/schemas/preset.json"
}
```

### `name`

- **Type**: `string`
- **Required**: Yes
- **Description**: Preset name (kebab-case)

```json
{
  "name": "react-tutorial-project"
}
```

### `version`

- **Type**: `string`
- **Required**: Yes
- **Format**: Semantic versioning (semver)
- **Description**: Preset version

```json
{
  "version": "1.0.0"
}
```

### `description`

- **Type**: `string`
- **Required**: No
- **Description**: Preset description

```json
{
  "description": "React tutorial project preset"
}
```

### `author`

- **Type**: `string`
- **Required**: No
- **Description**: Author information

```json
{
  "author": "John Doe"
}
```

### `tags`

- **Type**: `string[]`
- **Required**: No
- **Description**: Tags

```json
{
  "tags": ["react", "tutorial", "typescript"]
}
```

### `registries`

- **Type**: `string[]`
- **Required**: Yes
- **Description**: List of registries; version and language variant can be specified

**Format**:

- Full format: `@namespace/name[@version][:language]` (for non-`@rack` namespaces)
- Shorthand format: `name[@version][:language]` (CLI will automatically resolve to `@rack/name`, recommended for `@rack` registries)

**Version format** (follows semver):

- Exact version: `runtimes/node@1.0.0` or `@rack/runtimes/node@1.0.0`
- Without version: `runtimes/node` (uses latest version)

**Language variant** (optional `:js` or `:ts` suffix):

- Pin a single member to its JS variant: `frameworks/vue:js`
- Combine with version: `frameworks/vue@1.0.0:ts`
- Omit to inherit the project-wide `language` from `rack.json` (or `defaultLanguage` from the registry, falling back to `ts`)

```json
{
  "registries": [
    "runtimes/node",
    "build/vite",
    "frameworks/react",
    "@company/internal-tool@1.0.0"
  ]
}
```
