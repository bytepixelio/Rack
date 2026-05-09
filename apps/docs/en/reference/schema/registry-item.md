---
aside: false
---

# registry-item.json

`registry.json` is the configuration file for a single registry. `registry-item.json` is the schema used to validate the contents of `registry.json`, including dependencies, files, scripts, and other fields.

## Example

```json
{
  "$schema": "https://registry.rackjs.com/schemas/registry-item.json",
  "name": "react",
  "namespace": "@rack",
  "type": "registry:framework",
  "version": "1.0.0",
  "description": "React + TypeScript framework configuration",
  "tags": ["react", "typescript", "framework"],
  "priority": 2,
  "conflicts": ["frameworks/vue"],
  "registryDependencies": ["runtimes/node"],
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^5.0.0"
  },
  "files": [
    {
      "target": "index.html",
      "type": "registry:entry",
      "path": "./templates/react/index.html"
    },
    {
      "target": ".gitignore",
      "type": "registry:config",
      "content": "node_modules\ndist\n.env.local"
    }
  ],
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "languages": {
    "js": {
      "files": [
        {
          "target": "src/index.jsx",
          "type": "registry:entry",
          "path": "./templates/react-js/src/index.jsx"
        },
        {
          "target": "src/App.jsx",
          "type": "registry:entry",
          "path": "./templates/react-js/src/App.jsx"
        }
      ]
    },
    "ts": {
      "devDependencies": {
        "typescript": "^5.3.0"
      },
      "files": [
        {
          "target": "src/index.tsx",
          "type": "registry:entry",
          "path": "./templates/react/src/index.tsx"
        },
        {
          "target": "src/App.tsx",
          "type": "registry:entry",
          "path": "./templates/react/src/App.tsx"
        },
        {
          "target": "tsconfig.json",
          "type": "registry:config",
          "content": "{\n  \"compilerOptions\": {\n    \"target\": \"ES2020\",\n    \"jsx\": \"react-jsx\"\n  }\n}"
        }
      ]
    }
  },
  "defaultLanguage": "ts"
}
```

## Field Descriptions

### `$schema`

- **Type**: `string`
- **Required**: No
- **Description**: Schema URL for editor validation and autocompletion

```json
{
  "$schema": "https://registry.rackjs.com/schemas/registry-item.json"
}
```

### `name`

- **Type**: `string`
- **Required**: Yes
- **Format**: kebab-case
- **Description**: Unique identifier for the registry within its namespace

```json
{
  "name": "react"
}
```

### `namespace`

- **Type**: `string`
- **Required**: Yes
- **Format**: `@` followed by a kebab-case slug (e.g. `@rack`, `@company`)
- **Description**: Namespace the registry belongs to. Combined with `name`, it forms the globally unique identifier `@namespace/name` used in `rk add` commands and dependency references.

```json
{
  "namespace": "@rack"
}
```

### `type`

- **Type**: `string`
- **Required**: Yes
- **Description**: Registry type, determines its role in the tech stack

```json
{
  "type": "registry:framework"
}
```

**Available values**:

| Type                 | Description    | Recommended Priority |
| -------------------- | -------------- | -------------------- |
| `registry:runtime`   | Runtime        | 1                    |
| `registry:framework` | Framework      | 2                    |
| `registry:build`     | Build tool     | 3                    |
| `registry:feature`   | Feature module | 4                    |
| `registry:testing`   | Testing tool   | 5                    |
| `registry:quality`   | Quality tool   | 6                    |

### `path`

- **Type**: `string`
- **Required**: No
- **Format**: lowercase kebab segments joined by `/` (e.g. `quality/husky`)
- **Description**: Optional storage segment path under the namespace. Overrides the default placement derived from `type`. The last segment **must equal** `name`, otherwise upload fails with `UPLOAD_FAILED`. Use this when a registry's semantic role differs from its storage location (rare). When absent, the server derives the segment from `type` — see [Storage Path Resolution](/guide/registry-server/publishing#storage-path-resolution).

```json
{
  "namespace": "@rack",
  "name": "husky",
  "path": "quality/husky"
}
```

::: warning Distinct from `files[].path`
The top-level `path` controls where the **registry itself** is stored. The `path` inside a `files[]` entry points to a **template source file** (e.g. `./templates/.gitignore`). Same key name, different concepts.
:::

### `version`

- **Type**: `string`
- **Required**: Yes
- **Format**: Semantic versioning (semver)
- **Description**: Registry version number

```json
{
  "version": "1.0.0"
}
```

### `description`

- **Type**: `string`
- **Required**: No
- **Description**: Functional description of the registry

```json
{
  "description": "React + TypeScript framework configuration"
}
```

### `tags`

- **Type**: `string[]`
- **Required**: No
- **Description**: Tag array for categorization and search

```json
{
  "tags": ["react", "typescript", "framework"]
}
```

### `priority`

- **Type**: `integer` (≥ 0)
- **Required**: Yes
- **Recommended Range**: 1-6 (any non-negative integer is accepted)
- **Description**: Priority that determines installation order and version conflict resolution. Lower numbers install first and have higher priority.

```json
{
  "priority": 2
}
```

### `author`

- **Type**: `string`
- **Required**: No
- **Description**: Author name and (optionally) contact

```json
{
  "author": "Jane Doe <jane@example.com>"
}
```

### `license`

- **Type**: `string`
- **Required**: No
- **Description**: SPDX license identifier (e.g. `MIT`, `Apache-2.0`)

```json
{
  "license": "MIT"
}
```

### `homepage`

- **Type**: `string`
- **Required**: No
- **Format**: URI
- **Description**: Project homepage URL

```json
{
  "homepage": "https://example.com/my-registry"
}
```

### `repository`

- **Type**: `string`
- **Required**: No
- **Description**: Repository URL or shorthand (e.g. `github:owner/repo`)

```json
{
  "repository": "https://github.com/example/my-registry"
}
```

### `conflicts`

- **Type**: `string[]`
- **Required**: No
- **Description**: Conflicting registries that cannot be installed together

```json
{
  "conflicts": ["frameworks/vue"]
}
```

### `registryDependencies`

- **Type**: `string[]`
- **Required**: No
- **Description**: Other registries to be automatically installed. Version pinning (`@version` suffix) is not supported; dependencies always resolve to the latest version.

```json
{
  "registryDependencies": ["runtimes/node"]
}
```

### `dependencies`

- **Type**: `Record<string, string>`
- **Required**: No
- **Description**: Production dependencies

```json
{
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  }
}
```

### `devDependencies`

- **Type**: `Record<string, string>`
- **Required**: No
- **Description**: Development dependencies

```json
{
  "devDependencies": {
    "@vitejs/plugin-react": "^5.0.0",
    "typescript": "^5.3.0"
  }
}
```

### `files`

- **Type**: `FileObject[]`
- **Required**: No
- **Description**: Common file list

```json
{
  "files": [
    {
      "target": "index.html",
      "type": "registry:entry",
      "path": "./templates/react/index.html"
    },
    {
      "target": ".gitignore",
      "type": "registry:config",
      "content": "node_modules\ndist\n.env.local"
    }
  ]
}
```

**`FileObject` structure**

| Field          | Type    | Required | Description                                  |
| -------------- | ------- | -------- | -------------------------------------------- |
| target         | string  | Yes      | Target file path                             |
| type           | string  | Yes      | `FileObject` type                            |
| content        | string  | No       | Inline file content. For non-asset files, content takes priority over path when both are provided |
| path           | string  | No       | Template file path on the server. For `registry:asset`, path takes priority over content when both are provided |
| executable     | boolean | No       | Whether executable permission is needed      |
| mergeStrategy  | object  | No       | Merge strategy configuration                 |

**`path` format requirements**: relative POSIX path with an optional `./` prefix. Each segment must contain only `A-Z a-z 0-9 . _ @ + -`. The following are **not** allowed: percent-encoding (`%`), query (`?`), fragment (`#`), backslash (`\`), absolute paths, empty segments, or `.`/`..` segments. The referenced file must exist in the uploaded package and must be a regular file (not a directory or symlink).

For `registry:asset`, prefer using `path`. When `path` is used, the CLI writes the target file in binary mode and applies overwrite behavior.

**`mergeStrategy` configuration**

| Field     | Type   | Required | Description                                    |
| --------- | ------ | -------- | ---------------------------------------------- |
| type      | string | Yes      | Strategy type: `builtin` or `custom`           |
| strategy  | string | No       | Built-in strategy name (only when `type: "builtin"`): `json`, `ignore`, `env`, `overwrite` |
| script    | string | No       | Plugin script path (only when `type: "custom"`) |

**Example**:

Using built-in strategy:

```json
{
  "files": [
    {
      "target": "myconfig.json",
      "type": "registry:config",
      "path": "./templates/myconfig.json",
      "mergeStrategy": {
        "type": "builtin",
        "strategy": "json"
      }
    }
  ]
}
```

Using custom plugin:

```json
{
  "files": [
    {
      "target": "myconfig.json",
      "type": "registry:config",
      "path": "./templates/myconfig.json",
      "mergeStrategy": {
        "type": "custom",
        "script": "./scripts/merge-myconfig.js"
      }
    }
  ]
}
```

**`FileObject` types**

- `registry:entry` - Entry file
- `registry:config` - Configuration file
- `registry:lib` - Library file
- `registry:test` - Test file
- `registry:docs` - Documentation file
- `registry:script` - Script file (recommend setting `executable: true`)
- `registry:asset` - Static asset file

**Usage recommendations**

- Use `content` for simple configs (e.g. `.gitignore`, small `JSON` configs)
- Use `path` for complex code (e.g. `React` components, complex config files)

### `scripts`

- **Type**: `Record<string, string>`
- **Required**: No
- **Description**: `npm` scripts to add to `package.json`

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

### `languages`

- **Type**: `object` (keys must be `"js"` or `"ts"`)
- **Required**: No
- **Description**: Language-specific configuration. Only JavaScript (`js`) and TypeScript (`ts`) variants are currently supported

```json
{
  "languages": {
    "js": {
      "files": [
        {
          "target": "src/index.jsx",
          "type": "registry:entry",
          "path": "./templates/react/js/src/index.jsx"
        }
      ]
    },
    "ts": {
      "devDependencies": {
        "typescript": "^5.3.0"
      },
      "files": [
        {
          "target": "src/index.tsx",
          "type": "registry:entry",
          "path": "./templates/react/ts/src/index.tsx"
        },
        {
          "target": "tsconfig.json",
          "type": "registry:config",
          "content": "{...}"
        }
      ]
    }
  }
}
```

**Available fields** (the schema only allows the three below; any other key is rejected)

- `dependencies` - language-specific production dependencies
- `devDependencies` - language-specific development dependencies
- `files` - language-specific files

> Fields like `scripts`, `registryDependencies` must live at the registry's top-level (common) configuration; they cannot be placed inside `languages.X`.

**Design principles**

- `files` field stores common files
- `languages.js/ts.files` stores language-specific files

### `defaultLanguage`

- **Type**: `string` (must be `"js"` or `"ts"`)
- **Required**: No (recommended when `languages` is present)
- **Description**: Default language used when none is explicitly specified. The CLI resolves the variant in the order: `:language` suffix on the command line > `language` field in `rack.json` > `defaultLanguage` > `"ts"`.

```json
{
  "defaultLanguage": "ts"
}
```
