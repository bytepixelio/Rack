---
aside: false
---

# Preset Templates

Preset templates are pre-configured combinations of registries for quickly initializing specific types of projects.

## What Are Templates?

Preset templates package a set of commonly used registries together to form complete project templates. Using templates allows you to install all required registries at once without adding them individually.

```bash
# Without template - bootstrap from a single registry, then add the rest
rk init -t runtimes/node -n my-project
cd my-project
rk add frameworks/vue
rk add build/vite
rk add features/vue-router
rk add features/pinia
rk add quality/eslint

# With template - done in one step
rk init -t @presets/tutorial-project -n my-project
```

## Using Templates

#### Initialize Project

```bash
rk init -t @presets/tutorial-project
```

#### Specify Project Name

```bash
rk init -t @presets/tutorial-project -n my-project
```

#### CI Mode

Skip interactive prompts in CI environments.

```bash
rk init -t @presets/tutorial-project --ci
```

## Creating Templates

### 1. Create preset.json

```json
{
  "$schema": "https://registry.rackjs.com/schemas/preset.json",
  "name": "my-preset",
  "version": "1.0.0",
  "description": "My custom preset",
  "author": "Your Name",
  "tags": ["custom", "preset"],
  "registries": [
    "runtimes/node",
    "frameworks/vue",
    "build/vite",
    "features/vue-router"
  ]
}
```

### 2. Directory Structure

```bash
my-presets/
└── my-preset/
    └── preset.json
```

### 3. Deploy Template

The CLI fetches presets at `{host}/presets/{name}` (single-segment name, no `/preset.json` suffix, no namespace segment).

**Recommended: `@rack/registry-server`**

Use [Registry Server](/guide/registry-server/overview) directly — it has a built-in `/presets/...` route and uploads land at the correct path automatically.

**Self-hosted static file server**

Place `preset.json` at the matching path and configure a rewrite so `/presets/my-preset` returns the `preset.json` JSON content.

```bash
# Static server root layout
https://registry.company.com/
└── presets/
    └── my-preset/
        └── preset.json    # Served at URL: /presets/my-preset
```

**Actual URL the CLI requests**

```
https://registry.company.com/presets/my-preset
```

### 4. Configure and Use

```bash
# Configure private source
rk config set @mypresets --url https://registry.company.com

# Use custom template
rk init -t @mypresets/my-preset
```

