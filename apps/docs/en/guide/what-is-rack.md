---
aside: false
---

# What is Rack?

Rack is a modular project scaffolding tool based on a **Registry architecture**.

By combining different registries, you can quickly create and configure projects with the flexibility of building blocks.

## Core Features

Rack provides the following core features through its registry architecture:

- **Modular Configuration** - Split tech stacks into independent registries that can be freely combined and reused
- **Incremental Extension** - Add new feature modules at any time after project initialization
- **Dependency Management** - Automatically handle dependencies and version conflicts between registries
- **Enterprise Distribution** - Support private registry sources for easy sharing and management of configurations within teams

## Registry Mechanism

The core of Rack is the **Registry**. Each registry is a JSON configuration file that describes how a particular module of the tech stack should be configured: which npm packages to install, which config files to create, and which other registries it depends on or conflicts with.

When you run `rk init` or `rk add` commands, Rack analyzes dependencies between registries, detects conflicts, then intelligently merges configuration files according to priority rules, and finally installs the required dependency packages.

## Quick Examples

Initialize a `Vue` full-stack project:

```bash
rk init -t @presets/tutorial-project
```

Add state management to an existing project:

```bash
rk add features/pinia
```

Configure a private enterprise source:

```bash
rk config set @company --url https://registry.company.com --token your-token-here
```
