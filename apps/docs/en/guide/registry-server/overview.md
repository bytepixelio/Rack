---
aside: false
---

# Deployment Overview

Registry Server is one of the core components of the Rack architecture, responsible for hosting and distributing Registry JSON configurations, Preset templates, and project template files.

## What is Registry Server?

Registry Server is a static resource distribution server that provides a unified resource access interface for the Rack CLI tool. It supports:

- **Registry Distribution** - Host Registry JSON configurations and template files
- **Version Management** - Support multiple versions coexisting, automatically maintain version lists
- **Package Upload** - Support uploading new Registry packages via API
- **Namespace Management** - Support multi-tenant isolation and access control
- **Authentication & Authorization** - Token-based fine-grained permission management, with admin token support for cross-namespace operations
- **Webhook Integration** - Event-driven notification mechanism
- **Performance Optimization** - Built-in ETag caching, compression, and rate limiting

## Why Self-host?

While Rack provides an official Registry service (`https://registry.rackjs.com`), you may need to deploy your own Registry Server in the following scenarios:

- **Enterprise Private Deployment** - For internal enterprise use, services need to be deployed in private networks or intranet environments.
- **Custom Registry Management** - Need to host custom Registries and templates developed internally by the enterprise.
- **Access Control and Auditing** - Need fine-grained permission control and auditing for Registry access.
- **Offline Environments** - Use Rack in environments without internet access.
- **Custom Integration** - Need to integrate with existing enterprise CI/CD workflows and DevOps platforms.

## Service Architecture

Registry Server adopts a simple architecture design:

```
┌─────────────┐
│  Rack CLI   │ ←─────┐
└─────────────┘       │
                      │ HTTPS/HTTP
┌─────────────┐       │
│  CI/CD      │ ←─────┤
└─────────────┘       │
                      │
                ┌─────▼──────┐
                │  Registry  │
                │   Server   │
                └─────┬──────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
   ┌────▼────┐  ┌─────▼────┐  ┌─────▼────┐
   │ Static  │  │   Auth   │  │  Webhook │
   │ Storage │  │  System  │  │  System  │
   └─────────┘  └──────────┘  └──────────┘
```

**Core Modules**

- **Static Resource Service** - Distribute Registry, Preset, and Schema files
- **Upload Service** - Receive and process Registry package uploads
- **Authentication Service** - Token-based identity verification and permission control
- **Webhook Service** - Event notifications and integrations
- **Monitoring Service** - Health checks and Prometheus metrics

## Storage Modes & Deployment Topology

The `STORAGE_BACKEND` env var selects between two deployment shapes with very different read/write paths — pick before deploying:

### `STORAGE_BACKEND=local` (default)

Server handles both uploads and reads; everything sits on local disk at `STORAGE_ROOT`. Suitable for single-host deployments, intranet, or offline use.

```text
┌───────────────┐            ┌─────────────────┐     ┌─────────────────────────┐
│               │            │                 │     │                         │
│ Rack CLI / CI ├GET─/─POST─►│ Registry Server ├────►│ Local disk STORAGE_ROOT │
│               │            │                 │     │                         │
└───────────────┘            └─────────────────┘     └─────────────────────────┘
```

### `STORAGE_BACKEND=r2` (Cloudflare R2 + Worker)

Uploads still go through the Server (which keeps SHA256 verification, tar extraction, schema validation, webhook dispatch, etc.), but the packaged files land in a Cloudflare R2 bucket. Reads are served by a dedicated [Cloudflare Worker](https://github.com/bytepixelio/Rack/blob/main/apps/registry-worker/README.md) at the edge, fronted by `registry.rackjs.com` (or your own Worker domain in self-hosted setups).

```text
┌───────────────┐                                  ┌────────────────────────────┐       ┌─────────────────────────┐
│               │                                  │                            │       │                         │
│ Rack CLI / CI │    ├───POST─/registries─upload──►│      Registry Server       ├─write►│ R2 bucket rack-registry │
│               │                                  │                            │       │                         │
└───────┬───────┘                                  └────────────────────────────┘       └─────────────────────────┘
        │                                                                                            ▲
        │                                                                                            │
        │                                                                                            │
        │                                                                                            │
        │                                                                                            │
        │                                          ┌────────────────────────────┐                  read
        │                                          │                            │                    │
        └────────────────GET─read─────────────────►│ Worker registry.rackjs.com ├────────────────────┘
                                                   │                            │
                                                   └────────────────────────────┘
```

::: warning In r2 mode, point your CLI / clients at the Worker domain for reads
In this mode the Server **no longer writes to local disk**. Its `GET /registries/**` routes still exist but read from an empty local directory, so hitting the Server for downloads returns 404. Clients (Rack CLI, browser, CI) must use the Worker domain for reads; only `POST /registries` uploads go to the Server.
:::

::: tip One shared `auth.json` across both ends
The Server reads repo-root `config/auth.json` (gating uploads); the Worker reads `.auth/auth.json` from R2 (gating reads). The [`sync-auth.yml`](https://github.com/bytepixelio/Rack/blob/main/.github/workflows/sync-auth.yml) workflow automatically syncs the repo file to R2 whenever `config/auth.json` changes — no need to maintain two copies.
:::

## API Endpoints

| Method   | Path                                 | Description                                  |
| -------- | ------------------------------------ | -------------------------------------------- |
| GET/HEAD | `/registries/@ns/name/versions`      | Version list                                 |
| GET/HEAD | `/registries/@ns/name`               | Latest version                               |
| GET/HEAD | `/registries/@ns/name/1.0.0`         | Specific version                             |
| GET/HEAD | `/registries/@ns/name/1.0.0/files/*` | Template file                                |
| POST     | `/registries`                        | Upload registry package                      |
| GET      | `/namespaces`                        | List namespaces (auth-filtered)              |
| GET      | `/namespaces/:ns/registries`         | List registries in namespace (auth-required) |
| GET/HEAD | `/presets/:name`                     | Get preset template                          |
| GET/HEAD | `/schemas/:file`                     | Get JSON schema                              |
| GET      | `/health`                            | Health check                                 |
| GET      | `/metrics`                           | Prometheus metrics                           |
