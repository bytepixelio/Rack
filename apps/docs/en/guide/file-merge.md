---
aside: false
---

# File Merge Strategy

When multiple registries attempt to modify the same file, Rack uses intelligent merge strategies to avoid conflicts.

## Why File Merging?

Different registries may need to modify the same files.

- All registries might add npm scripts to `package.json`
- Multiple tools may configure `tsconfig.json`
- Different modules might add ignore rules to `.gitignore`

Rack applies different merge strategies based on file type, ensuring correct configuration without losing information.

::: tip Core Principles

- **Installation order determines override priority**: Later-installed registries override earlier-installed ones
- **File type determines merge strategy**: Configuration files are deeply merged, code files are fully replaced, ignore files are deduplicated and appended
  :::

## Merge Strategy Types

#### Deep Merge

**Applicable files**: `package.json`, `tsconfig.json`

**Strategy**: Recursively merge objects, deduplicate and merge arrays, later-installed values override earlier ones.

#### Merging `package.json`

```json
// Step 1: runtimes/node (priority: 1) installed first
{
  "name": "my-project",
  "scripts": {
    "dev": "tsx src/index.ts"
  },
  "dependencies": {
    "express": "^4.19.0"
  },
  "devDependencies": {
    "typescript": "^5.9.2"
  }
}
```

```json
// Step 2: quality/prettier (priority: 6) installed later
{
  "scripts": {
    "format": "prettier --write .",
    "dev": "prettier --check . && tsx src/index.ts"
  },
  "devDependencies": {
    "prettier": "^3.0.0"
  }
}
```

```json
// Merged result
{
  "name": "my-project",
  "scripts": {
    "dev": "prettier --check . && tsx src/index.ts", // ← prettier installed later, overrides node config
    "format": "prettier --write ." // ← newly added
  },
  "dependencies": {
    "express": "^4.19.0"
  },
  "devDependencies": {
    "typescript": "^5.9.2",
    "prettier": "^3.0.0" // ← newly added
  }
}
```

**Merge rules**

- **Object fields**: Recursively merged
- **scripts conflicts**: Later-installed overrides earlier-installed
- **dependencies**: All dependencies merged, version conflicts resolved by priority
- **Array fields**: Deduplicated and merged

#### Merging `tsconfig.json`

```json
// Step 1: runtimes/node (priority: 1) installed first
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "strict": true
  }
}
```

```json
// Step 2: frameworks/vue (priority: 2) installed later
{
  "compilerOptions": {
    "jsx": "preserve",
    "moduleResolution": "bundler",
    "strict": false
  }
}
```

```json
// Merged result
{
  "compilerOptions": {
    "target": "ES2022", // ← from node (no conflict)
    "module": "ESNext", // ← from node (no conflict)
    "strict": false, // ← vue installed later, overrides node's true
    "jsx": "preserve", // ← from vue (newly added)
    "moduleResolution": "bundler" // ← from vue (newly added)
  }
}
```

#### Line Deduplication and Append

**Applicable files**: `.gitignore`, `.dockerignore`, `.npmignore`

**Strategy**: Read line by line, deduplicate and append new lines.

```text
# Existing .gitignore
node_modules
dist
.env
```

```text
# New registry adds
dist
build
*.log
```

```text
# Merged result
node_modules
dist              # Deduplicated, kept once
.env
build             # Newly added
*.log             # Newly added
```

**Merge rules**

- Keep all existing lines
- Append new lines if they don't exist
- Preserve original order

#### Complete Replacement

**Applicable files**: Code files (`.js`, `.ts`, `.vue`, `.jsx`, `.tsx`, etc.)

**Strategy**: Later-installed completely replaces earlier-installed.

```typescript
// Step 1: runtimes/node (priority: 1) installed first, creates src/index.ts
import express from 'express'

const app = express()
app.listen(3000)
```

```typescript
// Step 2: frameworks/vue (priority: 2) installed later, also creates src/index.ts
import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')
```

```typescript
// Merged result
// vue installed later, completely replaces node's version
import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')
```

**Merge rules**

- Later-installed file completely replaces earlier-installed file
- No content from earlier-installed file is preserved
- If priorities are equal, later one overrides earlier one (with warning)

**Why this design?**

Code files cannot be "merged" like configuration files; one version must be chosen. Later-installed registries typically represent more specific scenarios and should override generic base code.

#### Smart Merge

**Applicable files**: `.env`, `.env.example`

**Strategy**: Merge by key, later-installed values override earlier ones.

```bash
# Step 1: runtimes/node (priority: 1) installed first, creates .env
NODE_ENV=development
PORT=3000
DB_HOST=localhost
```

```bash
# Step 2: frameworks/vue (priority: 2) installed later, adds to .env
PORT=8080
API_URL=https://api.example.com
```

```bash
# Merged result
NODE_ENV=development
PORT=8080              # ← vue installed later, overrides node's 3000
DB_HOST=localhost
API_URL=https://api.example.com  # ← newly added
```

## File Type Detection

Rack determines which strategy to use based on file path and extension:

| File Pattern                                                                                                  | Merge Strategy            | Description                |
| ------------------------------------------------------------------------------------------------------------- | ------------------------- | -------------------------- |
| `package.json` / `tsconfig.json` / `tsconfig.app.json` / `tsconfig.base.json` / `jsconfig.json` / `rack.json` | Deep merge                | Known JSON config files    |
| `*.schema.json`                                                                                               | Deep merge                | JSON Schema files          |
| `.gitignore` / `.npmignore` / `.dockerignore` / `.eslintignore` / `.prettierignore`                           | Line deduplication append | Known ignore files         |
| `.env*` (e.g. `.env`, `.env.example`, `.env.local`)                                                           | Smart merge               | Environment variable files |
| Anything else (including unlisted `*.json`, source files `*.ts` / `*.js` / `*.vue`, docs `*.md`, etc.)        | Complete replacement      | Default strategy           |

> To force a specific strategy on a file, declare it explicitly via `files[].mergeStrategy` in `registry.json` (see "Custom Merge Strategy" below).

## Merge Conflict Handling

The CLI never pauses to ask the user for a decision: conflicting fields always resolve via "later installation overrides earlier"; ties at the same priority resolve by the current install order. If the result isn't what you want, edit the generated target file (e.g. `package.json`) directly.

## Custom Merge Strategy

Add a `mergeStrategy` field to files in the `files` array of `registry.json`:

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

### Built-in Strategies

| Strategy Name | Description               | Use Cases                                           |
| ------------- | ------------------------- | --------------------------------------------------- |
| `json`        | JSON deep merge           | JSON configuration files                            |
| `ignore`      | Line deduplication append | `.gitignore`, `.npmignore`                          |
| `env`         | Merge by key              | `.env`, `.env.example`                              |
| `overwrite`   | Complete replacement      | Code files, documentation files, binary asset files |

> Note: `registry:asset` files loaded from `path` use a binary write path in the CLI. They default to overwrite behavior and do not use text merge strategies such as `json`, `ignore`, `env`, or `custom`.

### Example

Two registries both mark `myconfig.json` as `mergeStrategy: { type: "builtin", strategy: "json" }`, with templates:

```json
// feature-a/templates/myconfig.json
{ "plugins": ["plugin-a"], "settings": { "option1": "value1" } }

// feature-b/templates/myconfig.json
{ "plugins": ["plugin-b"], "settings": { "option2": "value2" } }
```

Merged result (arrays deduplicated and concatenated, objects merged recursively):

```json
{
  "plugins": ["plugin-a", "plugin-b"],
  "settings": {
    "option1": "value1",
    "option2": "value2"
  }
}
```

### Custom Plugins

For complex merge scenarios, you can use custom plugins to implement special merge logic.

#### Creating a Plugin

A plugin is a JavaScript module (supports ES Modules or CommonJS) that exports a `merge` function:

```javascript
// scripts/merge-myconfig.js
export function merge(params, helpers) {
  const current = params.currentContent ? JSON.parse(params.currentContent) : {}
  const incoming = JSON.parse(params.incomingContent)

  // Custom merge logic
  const merged = {
    ...current,
    ...incoming,
    // Special handling: merge arrays and deduplicate
    plugins: [...(current.plugins || []), ...(incoming.plugins || [])].filter(
      (v, i, arr) => arr.indexOf(v) === i
    )
  }

  // Can use environment information and helper functions from helpers (e.g., language)
  if (helpers.language === 'ts') {
    // TypeScript-specific merge logic
  }

  return {
    content: JSON.stringify(merged, null, 2) + '\n',
    changed: true,
    warnings: []
  }
}
```

#### Using a Plugin

Specify the plugin path in `registry.json`:

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

#### Plugin Interface

Plugins must export the following interface:

```typescript
interface MergeParams {
  filePath: string // Target file path
  currentContent?: string // Existing file content (if any)
  incomingContent: string // New file content
  fileDescriptor?: object // File descriptor
}

interface MergeHelpers {
  language?: 'js' | 'ts' // Language variant
}

interface MergeResult {
  content: string // Merged content
  changed: boolean // Whether changes occurred
  warnings?: Array<{
    // Warning messages (optional)
    message: string
  }>
}

// Plugin export
export function merge(
  params: MergeParams,
  helpers: MergeHelpers
): MergeResult | Promise<MergeResult>
```

**Important Notes**:

1. **File doesn't exist**: `currentContent` will be `null` or `undefined`, plugins must handle this:

   ```javascript
   export function merge(params, helpers) {
     const current = params.currentContent
       ? JSON.parse(params.currentContent)
       : {} // Use empty object as default when file doesn't exist
     // ...
   }
   ```

2. **Using environment information and helper functions**: The `helpers` parameter provides CLI environment information and helper functions for customizing merge logic:
   ```javascript
   export function merge(params, helpers) {
     // Adjust merge strategy based on language variant
     if (helpers.language === 'ts') {
       // TypeScript-specific handling
     }
     // ...
   }
   ```

#### Plugin Paths

- **Local Registry**: `script` path is relative to the registry root directory
- **Remote Registry**: Plugins are downloaded to a temporary directory for execution

#### Notes

- Plugins support both ES Modules and CommonJS
- Plugins can be synchronous or asynchronous functions
- Plugin paths are validated for security to prevent path traversal attacks
