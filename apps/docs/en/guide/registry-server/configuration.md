---
aside: false
---

# Configuration Guide

Registry Server provides rich configuration options that can be customized through environment variables and configuration files.

## Environment Variable Configuration

### Create Configuration File

Create a `.env` file in the `apps/registry-server` directory:

```bash
cd apps/registry-server
cp .env.example .env
```

### Basic Configuration

| Variable    | Default       | Description         |
| ----------- | ------------- | ------------------- |
| `PORT`      | `8080`        | Server port         |
| `HOST`      | `0.0.0.0`     | Server bind address |
| `NODE_ENV`  | `development` | Runtime environment |
| `LOG_LEVEL` | `info`        | Log level           |

**Example Configuration**

```bash
# .env
PORT=8080
HOST=0.0.0.0
NODE_ENV=production
LOG_LEVEL=info
```

::: tip Listen Address

- `0.0.0.0` - Listen on all network interfaces (suitable for server deployment)
- `127.0.0.1` - Local access only (suitable for development)
  :::

### Storage Configuration

| Variable               | Default                  | Description                                     |
| ---------------------- | ------------------------ | ----------------------------------------------- |
| `STORAGE_ROOT`         | `../../packages/storage` | Static resource root directory (relative path)  |
| `STORAGE_BACKEND`      | `local`                  | Upload storage backend: `local` or `r2`         |
| `R2_BUCKET_NAME`       | —                        | R2 bucket name (required when `STORAGE_BACKEND=r2`)       |
| `R2_ACCOUNT_ID`        | —                        | Cloudflare account ID (required when `STORAGE_BACKEND=r2`) |
| `R2_ACCESS_KEY_ID`     | —                        | R2 API access key ID (required when `STORAGE_BACKEND=r2`)  |
| `R2_SECRET_ACCESS_KEY` | —                        | R2 API secret access key (required when `STORAGE_BACKEND=r2`) |

**Example Configuration (Local)**

```bash
# Using relative path
STORAGE_ROOT=../../packages/storage

# Using absolute path (recommended for production)
STORAGE_ROOT=/data/registry-storage
```

**Example Configuration (R2)**

```bash
STORAGE_BACKEND=r2
R2_BUCKET_NAME=rack-registry
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key-id
R2_SECRET_ACCESS_KEY=your-secret-access-key
```

::: tip Storage Backend
When `STORAGE_BACKEND=local` (default), uploaded packages are stored on the local filesystem under `STORAGE_ROOT` and the Server handles both reads and writes. When `STORAGE_BACKEND=r2`, uploaded packages are pushed to a Cloudflare R2 bucket and **reads are served by a Cloudflare Worker directly from R2 at the edge** (`registry.rackjs.com` or your own Worker domain). In both modes, upload processing (temp files, checksum verification, tar extraction) happens locally — only the final storage destination differs.

⚠️ In r2 mode the Server no longer writes to local disk. Its `GET /registries/**` routes still exist but read from an empty local directory, so hitting the Server for downloads returns 404. Clients (Rack CLI, browser, CI) must point at the Worker domain for reads; only `POST /registries` uploads go to the Server. See [Deployment Overview](./overview.md#storage-modes-deployment-topology) for the full topology.
:::

::: warning Path Specification

- Relative path: Relative to the `apps/registry-server` directory
- Absolute path: Recommended for production to avoid path confusion
  :::

### Authentication Configuration

| Variable           | Default            | Description                                             |
| ------------------ | ------------------ | ------------------------------------------------------- |
| `AUTH_CONFIG_PATH` | `../../config/auth.json` | Path to auth.json (repo-root `config/auth.json`, shared with the Worker) |
| `ADMIN_TOKEN`      | _(not set)_        | System-level admin token for cross-namespace publishing |

**Example Configuration**

```bash
# Authentication configuration (defaults to repo-root config/auth.json, shared with the Worker)
# AUTH_CONFIG_PATH=../../config/auth.json

# Admin token (optional, enables cross-namespace publishing)
ADMIN_TOKEN=your-secret-admin-token
```

::: tip Admin Token
The `ADMIN_TOKEN` allows publishing to any namespace without per-namespace token configuration. When a request carries this token, it bypasses namespace-level auth checks during upload. This is useful for CI/CD systems that need to publish to multiple namespaces.
:::

::: tip R2 mode requires auth.json to be synced to R2
In `STORAGE_BACKEND=r2` mode, the Cloudflare Worker reads `.auth/auth.json` from the same R2 bucket to authenticate read requests, while the Server still reads the repo-root file to gate uploads. The [`sync-auth.yml`](https://github.com/bytepixelio/Rack/blob/main/.github/workflows/sync-auth.yml) workflow uploads `config/auth.json` to R2 on every push — without this sync (or a manual upload to `.auth/auth.json`), the Worker returns 403 for every namespace read.
:::

### Webhook Configuration

| Variable              | Default                | Description                              |
| --------------------- | ---------------------- | ---------------------------------------- |
| `WEBHOOK_CONFIG_PATH` | `config/webhooks.json` | Path to webhooks.json configuration file |

### Complete Example

```bash
# apps/registry-server/.env

# Basic configuration
PORT=8080
HOST=0.0.0.0
NODE_ENV=production
LOG_LEVEL=info

# Storage configuration
STORAGE_ROOT=/data/registry-storage
# STORAGE_BACKEND=local

# R2 configuration (required when STORAGE_BACKEND=r2)
# R2_BUCKET_NAME=rack-registry
# R2_ACCOUNT_ID=your-account-id
# R2_ACCESS_KEY_ID=your-access-key-id
# R2_SECRET_ACCESS_KEY=your-secret-access-key

# Authentication configuration (defaults to repo-root config/auth.json, shared with the Worker)
# AUTH_CONFIG_PATH=../../config/auth.json
# ADMIN_TOKEN=your-secret-admin-token

# Webhook configuration
WEBHOOK_CONFIG_PATH=config/webhooks.json
```

### Built-in Defaults (Not Configurable)

The following values are compiled into the server and cannot be changed via environment variables:

| Setting               | Value           | Description                                          |
| --------------------- | --------------- | ---------------------------------------------------- |
| Cache-Control max-age | `60` seconds    | `Cache-Control: public, max-age=60` on all responses |
| Compression           | Always enabled  | Supports `gzip`, `deflate`, `br` encodings           |
| Rate limit max        | `1200` requests | Maximum requests per window                          |
| Rate limit window     | `1 minute`      | Rate limit time window                               |
| Max upload size       | `100 MB`        | Maximum file upload size                             |

::: tip Rate Limiting
Rate limits are applied **per client IP**. When deploying behind a reverse proxy (e.g., Nginx), ensure `X-Forwarded-For` is correctly forwarded so each real client IP is counted independently. When the limit is exceeded, the server returns `429 Too Many Requests` with `{ "statusCode": 429, "error": "Too Many Requests", "message": "Rate limit exceeded, retry in X" }`
:::

## Authentication Configuration

The authentication configuration file (repo-root `config/auth.json`, shared with the [Cloudflare Worker](https://github.com/bytepixelio/Rack/blob/main/apps/registry-worker/README.md)) is the single source of truth for namespace access:

- A namespace must exist as a top-level key; namespaces missing from `auth.json` always return 403 Forbidden.
- An empty array `[]` or `null` value → anonymous read access (uploads still rejected unless using an admin token).
- Each object in the array represents a token with the following fields:

| Field       | Type    | Required | Description                                       |
| ----------- | ------- | -------- | ------------------------------------------------- |
| `token`     | string  | Yes      | Authentication token string                       |
| `publish`   | boolean | No       | Allow publishing (default `false`)                |
| `mark`      | string  | No       | Token purpose description                         |
| `expiresAt` | string  | No       | ISO 8601 expiration time; returns 401 once passed |

> Generate tokens with `openssl rand -hex 32` (≥ 32 characters of randomness) and split namespaces into separate read-only and publish tokens.

### Complete Configuration Example

```json
{
  "@rack": [],
  "@public": [],

  "@company": [
    {
      "token": "a3f9c8e7b2d1f4e6a9c7b5d8f3e1a2c4",
      "mark": "Team read-only access"
    },
    {
      "token": "b6d9e7f1a3c5b8d2e4f7a9c1b3d5e8f2",
      "publish": true,
      "mark": "CI/CD publishing service",
      "expiresAt": "2025-12-31T23:59:59Z"
    }
  ],

  "@private": [
    {
      "token": "c9e2f5a8b1d4c7e3f6a9b2c5d8e1f4a7",
      "publish": true,
      "mark": "Internal publishing system"
    }
  ]
}
```

## Webhook Configuration

The webhook configuration file is located at `apps/registry-server/config/webhooks.json`, used to configure event notifications.

### Configuration File Structure

```json
{
  "webhooks": [
    {
      "url": "https://example.com/webhook",
      "secret": "webhook-secret-key",
      "events": ["uploaded"],
      "enabled": true,
      "description": "description"
    }
  ]
}
```

**Field Description**

| Field         | Type     | Required | Description             |
| ------------- | -------- | -------- | ----------------------- |
| `url`         | string   | Yes      | Webhook endpoint URL    |
| `secret`      | string   | Yes      | HMAC-SHA256 signing key |
| `events`      | string[] | Yes      | Subscribed event types  |
| `enabled`     | boolean  | Yes      | Whether enabled         |
| `description` | string   | No       | Webhook description     |

### Supported Event Types

- `uploaded` - Triggered after Registry package upload succeeds
- `version.created` - Triggered after new version is installed and `versions.json` is updated

::: tip Event Trigger Order
Both `uploaded` and `version.created` events are emitted after the full upload pipeline completes (install + `versions.json` update). They are fired in sequence at the end of the process.
:::

### Configuration Examples

#### 1. Single Webhook

```json
{
  "webhooks": [
    {
      "url": "https://ci.company.com/webhook",
      "secret": "webhook-secret-2024",
      "events": ["uploaded"],
      "enabled": true,
      "description": "Trigger CI/CD pipeline"
    }
  ]
}
```

#### 2. Multiple Webhooks

```json
{
  "webhooks": [
    {
      "url": "https://ci.company.com/webhook",
      "secret": "ci-webhook-secret",
      "events": ["uploaded"],
      "enabled": true,
      "description": "CI/CD automatic build"
    },
    {
      "url": "https://notify.company.com/slack",
      "secret": "slack-webhook-secret",
      "events": ["uploaded", "version.created"],
      "enabled": true,
      "description": "Slack notification (subscribe to multiple events)"
    },
    {
      "url": "https://staging.company.com/webhook",
      "secret": "staging-secret",
      "events": ["uploaded"],
      "enabled": false,
      "description": "Staging environment (disabled)"
    }
  ]
}
```

### Webhook Event Format

When an event is triggered, Registry Server sends a POST request to the configured URL:

**Request Headers**

```
Content-Type: application/json
User-Agent: Rack-Registry-Webhook/1.0
X-Webhook-Event: uploaded
X-Webhook-Signature: sha256=...
X-Webhook-Timestamp: 2025-11-07T10:30:00.000Z
X-Webhook-Delivery: unique-id
```

**Request Body**

```json
{
  "event": "uploaded",
  "timestamp": "2025-11-07T10:30:00.000Z",
  "namespace": "@company",
  "name": "ui-kit",
  "version": "1.0.0",
  "path": "@company/ui-kit/1.0.0"
}
```

### Verifying Webhook Signatures

Verify signatures on the webhook receiver side (Node.js example):

```javascript
const crypto = require('crypto')

function verifyWebhookSignature(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(payload)
  const expected = `sha256=${hmac.digest('hex')}`

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}

// Using in Express
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature']
  const payload = JSON.stringify(req.body)

  if (!verifyWebhookSignature(payload, signature, 'your-secret')) {
    return res.status(401).send('Invalid signature')
  }

  // Handle webhook event
  console.log('Event received:', req.body)
  res.status(200).send('OK')
})
```

::: tip Webhook Retry

- Failed webhooks will automatically retry up to 3 times (4 total attempts)
- Retry intervals: 2 seconds, 4 seconds, 8 seconds (exponential backoff)
- Each delivery attempt has a **30-second timeout**; no response within 30 seconds is treated as a failure
- A 2xx status code is considered successful
- The webhook queue is **in-memory only**; pending retries are lost if the process restarts. Implement idempotent handling on the receiver side if guaranteed delivery is required
  :::
