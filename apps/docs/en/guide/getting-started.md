---
aside: false
---

# Getting Started

## Installation

Install Rack CLI globally using `npm`.

```bash
npm install -g rackjs-cli
```

Verify the installation.

```bash
rk version
```

## Initialize a Project

### Using a Preset Template

The simplest way is to initialize a project from a preset template.

```bash
rk init -t @presets/tutorial-project
```

Rack will prompt for the project name and then automatically:

- Download and parse all registries included in the template
- Detect dependencies and conflicts
- Generate project files and configuration
- Install `npm` dependencies
- Create the `rack.json` configuration file

### Manually Select Registries

For a more flexible tech stack, start from a single registry and add more on demand.

```bash
# Bootstrap a minimal project with the Node runtime template
rk init -t runtimes/node -n my-project
cd my-project
```

Then add the required registries one by one.

```bash
# Add framework
rk add frameworks/vue

# Add build tool
rk add build/vite
```

> `rk init` requires `-t/--template`. The template can be either a preset (`@presets/...`) or a single registry. `rk add` can run in any existing project directory; if `rack.json` is missing, a minimal one is generated from the directory name before continuing.

## Configure a Private Registry Source

By default the CLI uses the official source `@rack` → `https://registry.rackjs.com`. To wire up an internal source:

```bash
rk config set @company --url https://registry.company.com --token your-token-here
```

For full rules see [Namespace](/guide/namespace) and [Authentication](/guide/authentication).

## Health Check

`rk doctor` runs Node version, `git`, `rack.json`, and `/health` probes for every configured registry in parallel. See the [CLI reference](/reference/cli#rk-doctor) for full details.
