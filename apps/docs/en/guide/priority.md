---
aside: false
---

# Priority System

The priority system is the core mechanism that Rack uses to determine installation order and resolve file conflicts between registries.

## Why Priorities Matter?

When you combine multiple registries you face two challenges: **installation order** and **file conflicts**.

#### Installation Order

Certain parts of the stack depend on others and must be installed first.

```bash
# Incorrect: installing the framework before the runtime
1. Install Vue.js  → fails (no Node.js runtime yet)
2. Install Node.js → too late

# Correct: lay the foundation before the framework
1. Install Node.js → provides the runtime
2. Install Vue.js  → works as expected
```

#### File Conflicts

Two registries might want to change the same file, so you need a rule for which change wins.

```json
// Node.js runtime wants:
{ "scripts": { "dev": "node src/index.js" } }

// Vite build tool wants:
{ "scripts": { "dev": "vite" } }

// Which value should survive?
```

The **priority system** assigns each registry a priority number (recommended 1–6, users can customize), which defines both installation order and merge precedence.

## Priority Rules

The `priority` number has two effects:

1. **Installation order** – lower numbers install first (`1 → 2 → 3 → ...`).
2. **File merging** – later installations override earlier ones.

The conventional ladder is documented in [Registry Types](/guide/registry#registry-types) (Runtime=1, Framework=2, Build=3, Feature=4, Testing=5, Quality=6); any other non-negative integer is also accepted (e.g., `10` or `100` for custom tooling).

## What Priorities Control

### 1. Installation Order

Rack sorts registries by ascending priority when you run `rk add` or `rk init`.

```bash
rk add runtimes/node frameworks/vue build/vite testing/vitest quality/eslint
```

**Actual install order**

```
1. runtimes/node        (priority: 1)
2. frameworks/vue       (priority: 2)
3. build/vite           (priority: 3)
4. testing/vitest       (priority: 5)
5. quality/eslint       (priority: 6)
```

### 2. File Conflict Resolution

When multiple registries modify the same file, priority determines the merge strategy.

**Example conflict** (installing `Runtime` and `Framework`)

```json
// runtimes/node (priority: 1) installed first, writes:
{
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc"
  }
}

// frameworks/vue (priority: 2) installed later, writes:
{
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  }
}
```

#### Merge Strategy

For configuration files, a **deep merge** strategy is used, where later installations override earlier ones.

```json
// Final result:
{
  "scripts": {
    "dev": "vite", // ← Vue config overrides Node config
    "build": "vite build" // ← Vue config overrides Node config
  }
}
```

For source files, a **full replacement** strategy is used, where later installations completely replace earlier files.

```
# Node creates:
src/index.ts (generic entry file)

# Vue installs later and replaces with:
src/main.ts (Vue-specific entry file)
```

**Why this design?**

- Node provides a **generic environment** (works for any Node.js project)
- Vue provides a **specific scenario** (Vue.js project specific)
- Specific scenario configurations should override generic ones for the project to work properly

### 3. Dependency Version Conflicts

Different registries might require different versions of the same `npm` package:

```json
// frameworks/vue (priority: 2)
{
  "dependencies": {
    "vue": "^3.4.0"
  }
}

// features/pinia (priority: 4)
{
  "dependencies": {
    "vue": "^3.3.0"
  }
}
```

Resolution rules:

1. **Compatible ranges** → choose the newer version (`^3.4.0`).
2. **Incompatible ranges** → the lower-priority number wins (framework's `^3.4.0`).

## Setting a Priority

When authoring a registry, set `priority` according to the recommended values in [Registry Types](/guide/registry#registry-types). Registries of the same type should share the same priority number — don't bump priority just to "force override"; declare a `conflicts` relationship instead.
