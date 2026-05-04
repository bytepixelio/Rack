---
aside: false
---

# Creating Custom Registries

This chapter explains how to create and use custom registries.

## Why Create Registries?

You may need to create custom registries in the following scenarios:

- **Enterprise Standards** - Encapsulate unified tech stack configurations for teams
- **Customization Needs** - Create specialized configurations for specific project requirements
- **Configuration Reuse** - Package commonly used tool configurations as reusable modules
- **New Technology Support** - Create configurations for tech stacks not yet supported by official registries

## Basic Steps

Creating a registry requires completing the following steps.

## 1. Create Directory Structure

Create a registry directory in your local project.

```bash
my-registries/
└── ui-kit/
    ├── registry.json        # Registry configuration file
    └── templates/           # Template files directory
        ├── components/
        │   └── Button.tsx
        └── styles/
            └── index.css
```

**Directory explanation**

- `registry.json` - Core configuration file for the registry
- `templates/` - Directory for storing template files, organize subdirectories as needed

## 2. Write registry.json

Create a `ui-kit/registry.json` file to define the registry's basic information.

```json
{
  "$schema": "https://registry.rackjs.com/schemas/registry-item.json",
  "name": "ui-kit",
  "namespace": "@your-org",
  "type": "registry:feature",
  "version": "1.0.0",
  "description": "Enterprise UI component library",
  "priority": 4,
  "tags": ["ui", "components", "design-system"],
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0"
  },
  "files": [
    {
      "target": "src/components/Button.tsx",
      "type": "registry:lib",
      "path": "./templates/components/Button.tsx"
    },
    {
      "target": "src/styles/ui-kit.css",
      "type": "registry:lib",
      "path": "./templates/styles/index.css"
    }
  ]
}
```

**Key field explanations**

- `name` - Unique identifier for the registry, use kebab-case naming
- `type` - Registry type, determines its role in the tech stack
- `version` - Version number, follow semantic versioning
- `priority` - Priority level, determines installation order and override rules
- `files` - List of files to create or merge

For complete field descriptions, refer to [registry-item.json](/reference/schema/registry-item).

## 3. Choose Registry Type

Pick the appropriate `type` and `priority` from [Registry Types](/guide/registry#registry-types).

## 4. Create Template Files

Template files can be defined in two ways. **External files** and **inline content**.

#### Using External Files (Recommended)

Create template file `ui-kit/templates/components/Button.tsx`.

```typescript
import React from 'react'

export interface ButtonProps {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary'
}

export function Button({ children, onClick, variant = 'primary' }: ButtonProps) {
  return (
    <button className={`btn btn-${variant}`} onClick={onClick}>
      {children}
    </button>
  )
}
```

Reference using `path` in `registry.json`.

```json
{
  "files": [
    {
      "target": "src/components/Button.tsx",
      "type": "registry:lib",
      "path": "./templates/components/Button.tsx"
    }
  ]
}
```

#### Method 2: Using Inline Content

For simple configuration files, you can use the `content` field directly in `registry.json`.

```json
{
  "files": [
    {
      "target": ".gitignore",
      "type": "registry:config",
      "content": "node_modules\ndist\n*.log"
    }
  ]
}
```

## 5. Choose File Type

Select an appropriate `type` for each file.

| File Type         | Description                          | Examples                      |
| ----------------- | ------------------------------------ | ----------------------------- |
| `registry:entry`  | Application entry file               | `main.ts`, `index.ts`         |
| `registry:config` | Configuration file                   | `tsconfig.json`, `.gitignore` |
| `registry:lib`    | Library files and utility functions  | `utils.ts`, `helpers.ts`      |
| `registry:test`   | Test file                            | `*.test.ts`, `*.spec.ts`      |
| `registry:docs`   | Documentation file                   | `README.md`, `CHANGELOG.md`   |
| `registry:script` | Executable script (needs executable) | `setup.sh`, `build.sh`        |
| `registry:asset`  | Static asset file                    | Images, fonts, etc.           |

For `registry:asset`, prefer using `path` to reference external files. The CLI writes these files as binary with overwrite behavior, and they do not use text merge strategies.

## 6. Add Dependencies

#### Declare Registry Dependencies

If a registry requires other registries to function properly, use the `registryDependencies` field.

```json
{
  "name": "vue-router",
  "type": "registry:feature",
  "registryDependencies": ["frameworks/vue"]
}
```

Running `rk add features/vue-router` will automatically install `frameworks/vue`.

#### Declare Conflicts

If a registry is incompatible with other registries, use the `conflicts` field.

```json
{
  "name": "my-framework",
  "type": "registry:framework",
  "conflicts": ["frameworks/react", "frameworks/vue"]
}
```

Installation will be blocked when conflicting registries already exist in the project.

## 7. Support Language Variants

If you need to support both `JavaScript` and `TypeScript`, use the `languages` field. Each language block can only contain `dependencies`, `devDependencies`, and `files`.

```json
{
  "name": "my-registry",
  "type": "registry:feature",
  "version": "1.0.0",
  "description": "Registry supporting both JS and TS",
  "priority": 4,
  "files": [
    {
      "target": "package.json",
      "type": "registry:config",
      "path": "./templates/package.json"
    }
  ],
  "languages": {
    "js": {
      "files": [
        {
          "target": "src/index.js",
          "type": "registry:entry",
          "path": "./templates/js/src/index.js"
        }
      ]
    },
    "ts": {
      "devDependencies": {
        "typescript": "^5.9.2"
      },
      "files": [
        {
          "target": "src/index.ts",
          "type": "registry:entry",
          "path": "./templates/ts/src/index.ts"
        },
        {
          "target": "tsconfig.json",
          "type": "registry:config",
          "path": "./templates/ts/tsconfig.json"
        }
      ]
    }
  },
  "defaultLanguage": "ts"
}
```

For detailed information, refer to [Language Variants](/guide/language-variants).

## 8. Deploy Registry

After creation, deploy the registry to a server accessible via HTTP. The CLI fetches at `{host}/registries/{@namespace}/{path}[/{version}]`, so the deployment must serve URLs starting with `/registries/@<namespace>/`.

#### Deployment Methods

**Recommended: `@rack/registry-server`**

Use [Registry Server](/guide/registry-server/overview) directly — it has built-in routes for `/registries/...` / `/presets/...` / `/schemas/...` and handles uploads, version management, and authentication, so you don't have to lay out directories by hand.

**Self-hosted static file server**

Lay out the registry files to match the URLs the CLI expects. The server needs to map a request for `/registries/@company/ui-kit` to the `registry.json` file (most static servers require rewrite rules or directory-index configuration).

```bash
# Static server root layout
https://registry.company.com/
└── registries/
    └── @company/
        └── ui-kit/
            ├── registry.json    # Served at URL: /registries/@company/ui-kit
            └── templates/
                └── ...
```

**Actual URL the CLI requests**

```
https://registry.company.com/registries/@company/ui-kit
```

> The URL does not end with `/registry.json` — the server must return the `registry.json` JSON content at that path. See [Namespace → Registry URL Structure](/guide/namespace#registry-url-structure) for details.

## 9. Configure and Use

After deployment, configure the namespace and use the registry.

#### Configure Private Source

```bash
rk config set @company --url https://registry.company.com
```

If authentication is needed:

```bash
rk config set @company --url https://registry.company.com --token your-token-here
```

For detailed information, refer to [Authentication](/guide/authentication).

#### Use Registry

```bash
# Add registry
rk add @company/ui-kit

# Specify language variant
rk add @company/ui-kit:ts
```

#### Verify Installation

Check if files and configurations are correctly generated in the project.

```bash
# Check generated files
ls src/components/Button.tsx
ls src/styles/ui-kit.css

# Check if dependencies are installed
cat package.json
```
