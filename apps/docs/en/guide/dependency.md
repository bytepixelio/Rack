---
aside: false
---

# Dependency Resolution

Rack automatically resolves dependencies between registries, ensuring all required modules are correctly installed.

> **Example disclaimer**: this page uses hypothetical registries (`frameworks/vue`, `features/vue-router`, …) to illustrate dependency resolution. The actual `@rack/**` registries published today are listed in [the CLI reference](/reference/cli).

## Dependency Declaration

Registries declare dependencies using the `registryDependencies` field.

```json
{
  "name": "vue-router",
  "type": "registry:feature",
  "registryDependencies": ["frameworks/vue"]
}
```

This indicates that `vue-router` requires `vue` to function properly.

## Dependency Resolution Process

When you run `rk add features/vue-router`, Rack executes the following steps.

#### 1. Download Registry JSON

```
Download registry.json for features/vue-router
```

#### 2. Recursively Resolve Dependencies

```
Discover vue-router depends on frameworks/vue
→ Download registry.json for frameworks/vue
  → Discover vue depends on runtimes/node
    → Download registry.json for runtimes/node
      → node has no dependencies, resolution complete
```

```
features/vue-router
└── frameworks/vue
    └── runtimes/node
```

#### 3. Build Dependency Graph

Use topological sorting algorithm to build installation order.

```
runtimes/node (no dependencies, first)
    ↓
frameworks/vue (depends on node)
    ↓
features/vue-router (depends on vue)
```

#### 4. Detect Circular Dependencies

If circular dependencies are found, Rack throws an error.

```
CircularDependencyError:
  features/A → features/B → features/C → features/A
```

**Example**

```json
// features/A
{ "registryDependencies": ["features/B"] }

// features/B
{ "registryDependencies": ["features/C"] }

// features/C
{ "registryDependencies": ["features/A"] }  // Circular dependency
```

#### 5. Validate Conflicts

Check if registries to be installed conflict with already installed registries.

```bash
# Already installed
rk add frameworks/vue

# Attempting to install (will error)
rk add frameworks/react
```

**Error message**

```
ConflictError:
  frameworks/react conflicts with frameworks/vue
```

#### 6. Version Resolution

When multiple registries depend on the same `npm` package, Rack resolves version conflicts.

```json
// frameworks/vue
{ "dependencies": { "vue": "^3.4.0" } }

// features/pinia
{ "dependencies": { "vue": "^3.3.0" } }
```

**Resolution rules**

**Same version** → Keep that version

```json
vue: "^3.4.0" + vue: "^3.4.0" → "^3.4.0"
```

**Compatible versions** → Keep the intersection of every constraint

If one range is already a subset of every other, return that narrowest range:

```json
vue: "^3.4.0" + vue: "^3.3.0" → "^3.4.0"
```

Otherwise AND-join the ranges using `npm`'s range syntax so the package
manager enforces every original constraint:

```json
foo: "^1.0.0" + foo: "<1.5.0" → "^1.0.0 <1.5.0"
```

::: tip Why not just return the wider range?
Returning `^1.0.0` alone would let the package manager install `1.9.x`,
violating the `<1.5.0` upper bound. The joined form `^1.0.0 <1.5.0` is
valid syntax in `npm` / `pnpm` / `yarn` and is equivalent to the
intersection of both ranges.
:::

**Incompatible versions** → Lower priority number wins

```json
vue: "^3.4.0" (priority: 2) + vue: "^2.7.0" (priority: 4) → "^3.4.0"
```

::: tip Why does lower number win?
Registries with lower priority numbers (e.g., framework layer priority: 2) are foundational dependencies, and their version requirements should be prioritized.
:::

## Dependencies and Priority

Rack uses dependencies and the [priority system](/guide/priority) together to determine the final installation order.

::: tip Core Principle
**Dependencies** (hard constraints) take precedence over **priority numbers** (soft constraints).

A depended-upon Registry must be installed first, even if it has a higher priority number.
:::

### Sorting Algorithm

```
Final installation order = Sort by dependency level + Sort by priority number within the same level
```

**Rules**:

1. First calculate the dependency level for each Registry (no dependencies = level 0, depends on level N = level N+1)
2. Sort from low to high level (dependencies must be installed first)
3. Within the same level, sort by priority number from small to large

### Example

Assume the following registries:

```json
{
  "items": [
    {
      "name": "A",
      "priority": 1,
      "registryDependencies": ["B"] // A depends on B
    },
    {
      "name": "B",
      "priority": 4
    }
  ]
}
```

**Sorting result**: `B → A`

**Analysis**:

- B is at level 0 (no dependencies), A is at level 1 (depends on B)
- Although A's priority (1) is less than B's (4), the dependency relationship determines that B must be installed first
- Dependencies (hard constraints) take precedence over priority numbers (soft constraints)

## Conflict Declaration

Use the `conflicts` field to declare incompatible registries; the install pipeline aborts with a descriptive error as soon as one is hit.

```json
{
  "name": "vue",
  "type": "registry:framework",
  "conflicts": ["frameworks/react", "frameworks/svelte"]
}
```
