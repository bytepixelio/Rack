# Rack

> A modular project scaffolding tool based on Registry architecture. Quickly create and configure projects by combining different registries like building blocks.

## Project Overview

Rack is a Registry-architecture scaffolding system that enables developers to combine JSON-defined modules to install runtimes, frameworks, build tools, features, testing, and quality tooling via `rk init`/`rk add`. Modules remain composable after project creation, and enterprise teams can host private registries.

### Core Philosophy

- **Modular Configuration** - Split tech stacks into independent registries that can be freely combined and reused
- **Incremental Extension** - Add new feature modules at any time after project initialization
- **Dependency Management** - Automatically handle dependencies and version conflicts between registries
- **Enterprise Distribution** - Support private registry sources for easy sharing and management of configurations within teams

## Project Structure

Rack is a monorepo project containing the following main components:

```
Rack/
├── apps/
│   ├── cli/                    # CLI tool - project initialization and registry management
│   ├── registry-server/        # Registry Server - static resource server
│   ├── registry-worker/        # Cloudflare Worker - read-only edge proxy over R2
│   ├── e2e/                    # End-to-end tests - CLI + server integration
│   └── docs/                   # Documentation site - VitePress build
├── packages/
│   └── storage/                # Registry storage and JSON Schema
└── ...
```

## Quick Start

### Requirements

- Node.js >= 22.10.0
- pnpm >= 10.8.0

### Install CLI

```bash
npm install -g rackjs-cli
```

### Usage Examples

```bash
# Initialize a project
rk init -t @presets/tutorial-project

# Add a registry
rk add @rack/tailwindcss
```

## Development

### Environment Setup

```bash
# Install dependencies
pnpm install
```

### Common Commands

```bash
# Development mode
pnpm dev

# Build
pnpm build

# Test
pnpm test

# End-to-end tests
pnpm test:e2e

# Lint
pnpm lint
```

## Deploy Registry Server

The server ships two storage modes selected by `STORAGE_BACKEND`:

- `local` (default) — filesystem storage, Server handles both reads and writes. Single-host deployments.
- `r2` — uploads land in Cloudflare R2; reads are served by a Cloudflare Worker at the edge. Matches the `rackjs.com` topology.

Quick-start with local mode:

```bash
cd apps/registry-server
docker compose up -d
```

See [Registry Server README](./apps/registry-server/README.md#docker-deployment) for the full deployment guide (including R2 setup), and [CONTRIBUTING.md](./CONTRIBUTING.md) if you're forking and need CI to run against your own infrastructure.

## Release

This project uses [Changesets](https://github.com/changesets/changesets) for version management and automated npm publishing via GitHub Actions.

```bash
# 1. After making changes that need a release, create a changeset
pnpm changeset

# 2. Commit and push — CI runs automatically
# 3. GitHub Actions creates a "Version Packages" PR
# 4. Merge the PR — npm publish happens automatically
```

## CI/CD

Push to main triggers a single workflow (`.github/workflows/ci.yml`): build → lint → test → changesets (version PR or npm publish).

## Documentation

- **Online Documentation**: [https://rackjs.com](https://rackjs.com) | [中文版](https://rackjs.com/zh)
- **CLI Documentation**: [apps/cli/README.md](./apps/cli/README.md)
- **Registry Server Documentation**: [apps/registry-server/README.md](./apps/registry-server/README.md)
- **Registry Worker Documentation**: [apps/registry-worker/README.md](./apps/registry-worker/README.md)

## License

MIT
