---
aside: false
---

# Language Variants

Rack supports language variants, where a single registry provides different configurations and files based on the project's language (`JavaScript` or `TypeScript`).

## Why Language Variants?

The same tech stack often requires different configurations in `JavaScript` and `TypeScript` projects.

- **File extensions**: `.js` vs `.ts`, `.jsx` vs `.tsx`
- **Dependencies**: `TypeScript` projects need additional `typescript` and type definition packages
- **Configuration files**: `TypeScript` projects require `tsconfig.json`
- **Build tools**: May need different compiler options

Language variants allow a single registry to support both languages.

## Language Variant Structure

Use the `languages` field in a registry to define language-specific configurations.

```json
{
  "name": "vue",
  "type": "registry:framework",
  "priority": 2,

  // Common config (needed for both JS and TS)
  "dependencies": {
    "vue": "^3.4.0"
  },
  "files": [
    {
      "target": "index.html",
      "type": "registry:entry",
      "path": "./templates/index.html"
    }
  ],

  // Language-specific config
  "languages": {
    "js": {
      "files": [
        {
          "target": "src/main.js",
          "type": "registry:entry",
          "path": "./templates/js/main.js"
        }
      ]
    },
    "ts": {
      "devDependencies": {
        "typescript": "^5.9.2",
        "vue-tsc": "^2.0.0"
      },
      "files": [
        {
          "target": "src/main.ts",
          "type": "registry:entry",
          "path": "./templates/ts/main.ts"
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

## Configuration Options

#### Common Configuration

Fields outside the `languages` section apply to all languages.

```json
{
  "dependencies": {
    "vue": "^3.4.0" // Needed for both JS and TS
  },
  "files": [
    {
      "target": "index.html", // JS and TS share the same HTML
      "type": "registry:entry",
      "path": "./templates/index.html"
    }
  ]
}
```

#### Specific Configuration

Configurations in `languages.js` and `languages.ts` only take effect in their respective languages. Each language block can only contain `dependencies`, `devDependencies`, and `files` (enforced by the JSON Schema; see [registry-item.json](/reference/schema/registry-item)).

```json
{
  "languages": {
    "js": {
      "files": [...],           // JS projects only
      "dependencies": {...},    // JS projects only
      "devDependencies": {...}  // JS projects only
    },
    "ts": {
      "files": [...],           // TS projects only
      "devDependencies": {...}  // TS projects only
    }
  }
}
```

> If a `script` or `envVar` is language-specific, place it in the registry's top-level (common) configuration or split it out into a separate registry. Language blocks do not accept these fields.

#### `defaultLanguage`

Specifies the default language to use.

```json
{
  "defaultLanguage": "ts"
}
```

When users don't explicitly specify a language, the default language is used.

## Using Language Variants

#### Use Project-Configured Language

Set the project language in `rack.json`.

```json
{
  "name": "my-project",
  "language": "ts"
}
```

Then add the registry.

```bash
rk add frameworks/vue
```

Rack will automatically use the `languages.ts` configuration.

#### Explicitly Specify Language

Use the `:language` suffix to force specify.

```bash
# Use TypeScript variant
rk add frameworks/vue:ts

# Use JavaScript variant
rk add frameworks/vue:js
```

**Full Format Examples** (with namespace):

```bash
# Full format: @namespace/path/to/registry:language
rk add @rack/runtimes/node:ts          # Official Node.js TypeScript variant
rk add @rack/runtimes/node:js          # Official Node.js JavaScript variant
rk add @rack/frameworks/vue:ts         # Official Vue.js TypeScript variant
rk add @company/internal-tools:js      # Private registry JavaScript variant

# Shorthand format (omit @rack namespace)
rk add runtimes/node:ts
rk add runtimes/node:js
rk add frameworks/vue:ts
rk add frameworks/vue:js
```

This overrides the language setting in `rack.json`.

#### Use Default Language

If `rack.json` doesn't have a `language` field and the command doesn't specify one, the registry's `defaultLanguage` is used.

```bash
# No language field in rack.json
rk add frameworks/vue  # Uses defaultLanguage: "ts"
```

## Merge Rules

#### File Merge

Common `files` + language-specific `files` = final file list.

```json
{
  "files": [
    { "target": "index.html", ... }  // Common
  ],
  "languages": {
    "ts": {
      "files": [
        { "target": "src/main.ts", ... },  // TS-specific
        { "target": "tsconfig.json", ... }
      ]
    }
  }
}
```

**Final files for TS project**

- `index.html` (common)
- `src/main.ts` (TS-specific)
- `tsconfig.json` (TS-specific)

#### Dependency Merge

Common dependencies + language-specific dependencies = final dependencies.

```json
{
  "dependencies": {
    "vue": "^3.4.0" // Common
  },
  "devDependencies": {
    "vite": "^5.0.0" // Common
  },
  "languages": {
    "ts": {
      "devDependencies": {
        "typescript": "^5.9.2", // TS-specific
        "vue-tsc": "^2.0.0"
      }
    }
  }
}
```

**Final dependencies for TS project**

```json
{
  "dependencies": {
    "vue": "^3.4.0"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "typescript": "^5.9.2",
    "vue-tsc": "^2.0.0"
  }
}
```

#### Scripts Merge

The `scripts` field is part of a registry's top-level configuration and cannot be placed inside `languages.js` / `languages.ts` (the schema rejects it). When two languages need different scripts, put the default-language version in the common `scripts` and let downstream registries (e.g. build tools) override it.

```json
{
  "scripts": {
    "dev": "vite",
    "preview": "vite preview"
  }
}
```

> If you really need fundamentally different scripts per language, split the registry (e.g. `frameworks/vue` vs `frameworks/vue-spa`) instead of trying to override `scripts` via language variants.
