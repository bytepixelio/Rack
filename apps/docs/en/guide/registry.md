---
aside: false
---

# Registries

Registries are the core building block in Rack—a JSON manifest that describes a slice of your technology stack.

## What Is a Registry?

A registry behaves like a configuration bundle that fully defines how a specific module should be applied to a project.

- Which `npm` dependencies need to be installed
- Which files should be created or modified
- Which `npm` scripts should be added
- Which other registries it depends on or conflicts with

## Registry Types

| Type                 | Description     | Examples                                  | Suggested Priority |
| -------------------- | --------------- | ----------------------------------------- | ------------------ |
| `registry:runtime`   | Runtimes        | `Node.js` `Bun` `Deno`                    | 1                  |
| `registry:framework` | Application frameworks | `Vue.js` `React` `Next.js`                | 2                  |
| `registry:build`     | Build tooling   | `Vite` `Webpack` `PostCSS` `Rollup`       | 3                  |
| `registry:feature`   | Feature modules | `Vue Router` `TailwindCSS` `React Router` | 4                  |
| `registry:testing`   | Testing tools   | `Vitest` `Jest` `Playwright`              | 5                  |
| `registry:quality`   | Quality tooling | `ESLint` `Prettier` `CommitLint`          | 6                  |

## Registry Structure

A typical registry contains the following sections.

```json
{
  "$schema": "https://registry.rackjs.com/schemas/registry-item.json",
  "name": "node",
  "type": "registry:runtime",
  "version": "1.0.0",
  "description": "Minimal Node.js runtime setup with TypeScript tooling.",
  "priority": 1,
  "tags": ["node", "typescript", "runtime"],
  "devDependencies": {
    "typescript": "^5.9.2",
    "tsx": "^4.20.6"
  },
  "files": [
    {
      "target": "package.json",
      "type": "registry:config",
      "path": "./templates/node/ts/package.json"
    },
    {
      "target": "tsconfig.json",
      "type": "registry:config",
      "path": "./templates/node/ts/tsconfig.json"
    },
    {
      "target": "src/index.ts",
      "type": "registry:entry",
      "path": "./templates/node/ts/src/index.ts"
    }
  ]
}
```

:::tip Language variants
The example above only supports `TypeScript`. If you need a registry that works with both `JavaScript` and `TypeScript`, see [Language Variants](/guide/language-variants).
:::

For the complete schema, refer to [registry-item.json](/reference/schema/registry-item).

## Registry Relationships

Registries can declare dependencies or conflicts with other registries.

### Dependencies

Use `registryDependencies` when one registry requires another to function.

```json
{
  "name": "vue-router",
  "type": "registry:feature",
  "registryDependencies": ["frameworks/vue"]
}
```

Running `rk add features/vue-router` will automatically install `frameworks/vue`.

### Conflicts

Use `conflicts` when two registries cannot coexist.

```json
{
  "name": "vue",
  "type": "registry:framework",
  "conflicts": ["frameworks/react", "frameworks/nextjs"]
}
```

If `React` is already installed, attempting to add `Vue` will fail.

## Registry Lifecycle

When you run `rk add runtimes/node`, Rack will:

1. **Download Registry** - Fetch the JSON manifest for `node` from the configured source
2. **Resolve Dependencies** - Inspect `registryDependencies` and recursively download all required registries
3. **Detect Conflicts** - Verify that no registries declared in `conflicts` are already installed
4. **Merge Files** - Intelligently merge files according to priority rules (see [File Merge Strategy](/guide/file-merge))
5. **Install Dependencies** - Run `npm install` or `pnpm install` to install npm packages
6. **Update Configuration** - Record all applied registries (including transitive dependencies) in the `items` array of `rack.json`

## Registry Sources

Official registries under `@rack` can be installed directly with `rk add runtimes/node`; once a private source is configured, registries become accessible via `@company/...` identifiers. For namespace configuration and authentication, see [Namespace](/guide/namespace) and [Authentication](/guide/authentication).
