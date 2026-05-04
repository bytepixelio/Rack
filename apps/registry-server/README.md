# Rack Registry Server

Registry asset server for the Rack project, built on Fastify 5. Hosts and serves Registry JSON, Preset templates, and project template files.

## Quick start

```bash
# Install dependencies (repository root)
pnpm install

# Development
pnpm --filter @rack/registry-server dev

# Build
pnpm --filter @rack/registry-server build

# Test
pnpm --filter @rack/registry-server test
```

The server listens on `http://localhost:8080` by default.

## API endpoints

| Method     | Path                                    | Description                      |
| ---------- | --------------------------------------- | -------------------------------- |
| `GET`      | `/health`                               | Health check                     |
| `GET`      | `/metrics`                              | Prometheus metrics               |
| `GET`      | `/namespaces`                           | List all namespaces              |
| `GET`      | `/namespaces/:ns/registries`            | List registries in a namespace   |
| `GET/HEAD` | `/schemas/:file`                        | JSON Schema files                |
| `GET/HEAD` | `/presets/:name`                        | Preset configuration             |
| `GET/HEAD` | `/registries/@ns/name/versions`         | Version list                     |
| `GET/HEAD` | `/registries/@ns/name`                  | Latest registry                  |
| `GET/HEAD` | `/registries/@ns/name/:version`         | Registry at a specific version   |
| `GET/HEAD` | `/registries/@ns/name/:version/files/*` | Template files                   |
| `POST`     | `/registries`                           | Upload registry package (tar.gz) |

Examples: `/registries/@rack/runtimes/node/1.0.0`, `/registries/@rack/node/versions`. Namespaces must start with `@`.

### Error response format

All errors return `{ code, message }`:

```json
{ "code": "NOT_FOUND", "message": "Resource not found" }
```

### Upload

```bash
curl -X POST http://localhost:8080/registries \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "package=@registry-package.tar.gz" \
  -F "checksum=<sha256-hex>"
```

Success returns `201`:

```json
{
  "message": "Registry uploaded successfully",
  "namespace": "@rack",
  "name": "node",
  "version": "1.0.0",
  "path": "@rack/node/1.0.0"
}
```

Upload pipeline (configurable storage backend via `STORAGE_BACKEND`):

```text
┌──────────────────────────────────┐
│          Upload Request          │
└─────────────────┬────────────────┘
                  ▼
┌──────────────────────────────────┐
│        Save to temp file         │
└─────────────────┬────────────────┘
                  ▼
┌──────────────────────────────────┐
│      SHA256 checksum verify      │
└─────────────────┬────────────────┘
                  ▼
┌──────────────────────────────────┐
│          Extract tar.gz          │
└─────────────────┬────────────────┘
                  ▼
┌──────────────────────────────────┐
│       Parse registry.json        │
└─────────────────┬────────────────┘
                  ▼
┌──────────────────────────────────┐
│   Validate namespace & schema    │
└─────────────────┬────────────────┘
                  ▼
◇──────────────────────────────────◇
│         STORAGE_BACKEND?         ├──────────────────────┐
◇─────────────────┬────────────────◇                     r2
                local                                     │
                  ▼                                       ▼
┌──────────────────────────────────┐     ┌────────────────────────────────┐
│   Atomic rename to storage dir   │     │   Upload files to R2 bucket    │
└─────────────────┬────────────────┘     └────────────────┬───────────────┘
                  ▼                                       ▼
┌──────────────────────────────────┐     ┌────────────────────────────────┐
│ Regenerate versions.json locally │     │ Regenerate versions.json in R2 │
└─────────────────┬────────────────┘     └────────────────┬───────────────┘
                  ├───────────────────────────────────────┘
                  ▼
┌──────────────────────────────────┐
│       Emit webhook events        │
└──────────────────────────────────┘
```

### Webhook

After a successful upload, `uploaded` and `version.created` events are delivered via POST to configured webhook endpoints.

- HMAC-SHA256 signature (`X-Webhook-Signature: sha256=...`)
- Up to 4 attempts with exponential backoff (2s → 4s → 8s)
- 30 second timeout
- In-memory queue; lost on process restart

## Configuration

### Environment variables

Copy `.env.example` to `.env`:

| Variable               | Default                  | Description                                                             |
| ---------------------- | ------------------------ | ----------------------------------------------------------------------- |
| `PORT`                 | `8080`                   | Server port (1–65535)                                                   |
| `HOST`                 | `0.0.0.0`                | Bind address                                                            |
| `STORAGE_ROOT`         | `../../packages/storage` | Storage root directory                                                  |
| `STORAGE_BACKEND`      | `local`                  | Upload storage backend: `local` or `r2`                                 |
| `AUTH_CONFIG_PATH`     | `../../config/auth.json` | Auth config path (repo-root `config/auth.json`, shared with the Worker) |
| `WEBHOOK_CONFIG_PATH`  | `config/webhooks.json`   | Webhook config path                                                     |
| `LOG_LEVEL`            | `info`                   | Log level                                                               |
| `NODE_ENV`             | `development`            | Runtime environment                                                     |
| `ADMIN_TOKEN`          | —                        | System-level admin token for cross-namespace publishing (optional)      |
| `R2_BUCKET_NAME`       | —                        | R2 bucket name (required when `STORAGE_BACKEND=r2`)                     |
| `R2_ACCOUNT_ID`        | —                        | Cloudflare account ID (required when `STORAGE_BACKEND=r2`)              |
| `R2_ACCESS_KEY_ID`     | —                        | R2 API access key ID (required when `STORAGE_BACKEND=r2`)               |
| `R2_SECRET_ACCESS_KEY` | —                        | R2 API secret access key (required when `STORAGE_BACKEND=r2`)           |

Compression (gzip/deflate/br) and caching (ETag, Cache-Control 60s) are always enabled. Rate limiting is fixed at 1200 requests per client IP per minute.

### Auth configuration (`auth.json`)

`config/auth.json` (repo-root) is the single source of truth for namespace access — both this server and the [Cloudflare Worker](../registry-worker/README.md) read from the same file. The Worker picks it up via R2 (synced by `.github/workflows/sync-auth.yml`). Namespaces not listed are rejected (403).

```json
{
  "@rack": [],
  "@company": [
    { "token": "read-token", "mark": "CI read-only" },
    { "token": "publish-token", "publish": true, "mark": "Publishing" }
  ],
  "@private": [
    { "token": "secret", "publish": true, "expiresAt": "2026-12-31T23:59:59Z" }
  ]
}
```

Rules:

- Empty array `[]` = anonymous read access (no token required for reads)
- Non-empty token array = authentication required for reads and uploads
- `publish: true` = uploads allowed (for non-anonymous namespaces)
- `expiresAt` = ISO 8601 expiry
- Anonymous namespaces **do not allow uploads** — use `ADMIN_TOKEN` or configure namespace tokens
- `ADMIN_TOKEN` holders can publish to **any** namespace, bypassing namespace-level auth

Pass tokens via `Authorization: Bearer xxx` or `X-Registry-Token: xxx`.

### Webhook configuration (`webhooks.json`)

See `config/webhooks.json`:

```json
{
  "webhooks": [
    {
      "url": "https://ci.example.com/webhook",
      "secret": "your-secret",
      "events": ["uploaded", "version.created"],
      "enabled": true,
      "description": "CI trigger"
    }
  ]
}
```

Restart the server after changing configuration files.

For architecture and core flows, see [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## Docker deployment

### Quick start

```bash
cd apps/registry-server
docker compose up -d
```

The server is published on host port `18080` by default (override with
`HOST_PORT=...` in `.env`). Inside the container it always listens on
`8080` — don't change that unless you also update the `HEALTHCHECK`.

### Running local and r2 modes side by side

The compose file passes `STORAGE_BACKEND` and the `R2_*` variables through
as `${...}`, so one image serves both modes. To run them in parallel (e.g.
spin up an r2-mode instance locally to validate the prod R2 pipeline without
touching the running local-mode container), keep local mode under the default
project name and give r2 mode its own env file + project name + host port.

Create `apps/registry-server/.env.r2.local` (gitignored via `.env.*.local`):

```env
STORAGE_BACKEND=r2
R2_BUCKET_NAME=rack-registry
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
ADMIN_TOKEN=r2-admin-token
HOST_PORT=18081
```

Then:

```bash
# local mode — host port 18080
docker compose up -d

# r2 mode — host port 18081, independent project name
docker compose --env-file .env.r2.local -p rack-r2 up -d

# tear down just the r2 stack
docker compose -p rack-r2 down -v
```

`PORT` and `HOST` in the env file are ignored (the compose hardcodes them
inside the container); only `HOST_PORT` affects the published port. Confirm
the R2 backend actually loaded with `docker compose -p rack-r2 logs
registry-server | grep "R2 upload backend"`.

### Build and run manually

```bash
# Build from repository root (required for schema files access)
docker build -f apps/registry-server/Dockerfile -t rack-registry .

# Run with defaults (host 18080 → container 8080)
docker run -p 18080:8080 rack-registry

# Run with custom config and persistent storage
docker run -p 18080:8080 \
  -v ./config:/app/config:ro \
  -v $(pwd)/../../config/auth.json:/app/config/auth.json:ro \
  -v registry-data:/data \
  -e ADMIN_TOKEN=your-secret \
  rack-registry
```

### Volumes

| Mount point                 | Purpose                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `/data`                     | Registry storage (uploaded packages, `versions.json`, `.healthcheck`)               |
| `/app/config/webhooks.json` | Webhook config (from `apps/registry-server/config/webhooks.json`)                   |
| `/app/config/auth.json`     | Namespace/token policy — shared with the Worker (from repo-root `config/auth.json`) |

`auth.json` is bind-mounted from the repo root so the server and the
Cloudflare Worker stay on the same source of truth. The image ships with
a `{"@rack":[]}` placeholder, which the mount overrides at runtime.
`docker compose` already wires this up; for `docker run` pass an extra
`-v .../config/auth.json:/app/config/auth.json:ro`.

JSON Schemas live at `/app/schema` **inside the image**, not in the
`/data` volume. They travel with the image, so `docker compose up -d
--build` is enough to roll out schema changes — no `down -v` needed.

### Health check

The image includes a built-in `HEALTHCHECK` that polls `GET /health` every 30 seconds. Docker marks the container as `unhealthy` after 3 consecutive failures.

```bash
docker inspect --format='{{.State.Health.Status}}' <container>
```

## Project layout

```
src/
├── server.ts                  # Entry point
├── app.ts                     # buildApp(config)
├── config.ts                  # Environment loading
├── constants.ts               # Compile-time constants
├── types.ts                   # Type definitions
├── lib/                       # Pure utilities
│   ├── errors.ts              # Domain error classes
│   ├── path.ts                # Path resolution & safety checks
│   └── file-stream.ts         # Streaming file responses
├── services/                  # Business logic
│   ├── auth.service.ts        # Authentication
│   ├── storage.service.ts     # Filesystem
│   ├── registry.service.ts    # Registry queries
│   ├── upload.service.ts      # Upload handling (local + R2)
│   ├── r2-upload-backend.ts   # Cloudflare R2 upload backend
│   ├── webhook.service.ts     # Webhook delivery
│   └── schema-validator.service.ts
├── plugins/                   # Fastify plugins
│   ├── services.ts            # Service registration
│   ├── auth-hook.ts           # Auth hook
│   ├── error-handler.ts       # Error handling
│   ├── rate-limit.ts          # Rate limiting
│   ├── metrics.ts             # Prometheus
│   └── request-logger.ts      # Request logging
└── routes/                    # HTTP routes
    ├── health.route.ts
    ├── namespace.route.ts
    ├── schema.route.ts
    ├── preset.route.ts
    ├── registry.route.ts
    └── upload.route.ts
```
