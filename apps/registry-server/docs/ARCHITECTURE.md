# Registry Server architecture

## Layered architecture

```
                      ┌───────────┐
                      │  Request  │
                      └─────┬─────┘
                            │
                            ▼
┌───────────────────────────────────────────────────────────┐
│  rate-limit ──▶ req-logger ──▶ auth ──▶ err ──▶ metrics   │
└───────────────────────────┬───────────────────────────────┘
                            │
                            ▼
                  ┌─────────────────────┐
                  │       Routes        │
                  └─────────┬───────────┘
                            │
                            ▼
                  ┌─────────────────────┐
                  │      Services       │
                  └─────────┬───────────┘
                            │
                            ▼
                  ┌─────────────────────┐
                  │        Lib          │
                  └─────────────────────┘
```

- **Plugins** — cross-cutting concerns: rate limiting, logging, auth, error handling, metrics
- **Routes** — HTTP layer: parse params, call Service, format response
- **Services** — business logic: `AuthService`, `RegistryService`, `UploadService`, `WebhookService`, etc.
- **Lib** — pure utilities: `errors.ts`, `path.ts`, `file-stream.ts`

Three rules:

- **Routes hold no business logic** — only parameter extraction, Service calls, and response formatting
- **Services are HTTP-agnostic** — no `request`/`reply`; testable in isolation
- **Lib has no Fastify dependency** — pure functions, no side effects

## Dependency injection

All Services are registered on the Fastify instance via `decorate()`; routes access them as `app.xxxService`:

```
┌────────────┐     ┌─────────────┐     ┌────────────────┐
│ loadConfig │────▶│  buildApp   │────▶│ servicesPlugin │
└────────────┘     └─────────────┘     └───────┬────────┘
                                               │
                   ┌───────────────────────────┘
                   │
                   ▼
       ┌───────────────────────────┐
       │  config                   │
       │  authService              │
       │  storageService           │
       │  registryService          │
       │  uploadService            │
       │  webhookService           │
       │  schemaValidatorService   │
       └───────────────────────────┘
```

No global singletons and no import-level shared state. Each `buildApp(config)` call yields an isolated instance so tests can run in parallel.

### Service initialization order

```
┌─ Layer 1 ──────────────────────────────────────────────┐
│                                                        │
│  ┌─────────────┐  ┌────────────────┐                   │
│  │ AuthService │  │ StorageService │                   │
│  └──────┬──────┘  └────────────────┘                   │
│  ┌──────────────────┐  ┌─────────────────────────────┐ │
│  │  WebhookService  │  │  SchemaValidatorService     │ │
│  └──────┬───────────┘  └─────────────────────────────┘ │
└─────────┼──────────────────────────────────────────────┘
          │
          ▼
   await .load()
          │
          ▼
┌─ Layer 2 ──────────────────────────────────────────────┐
│                                                        │
│  ┌──────────────────┐  ┌───────────────┐               │
│  │ RegistryService  │  │ UploadService │               │
│  └──────────────────┘  └───────────────┘               │
└────────────────────────────────────────────────────────┘
```

Layer 2 services depend on Layer 1: `RegistryService` needs `storageService`; `UploadService` needs `authService`, `storageService`, `schemaValidatorService`, `webhookService`.

## Request lifecycle

From entry to response, a request passes through:

```
┌──────────────────────────────────────────────────────────┐
│ error-handler (global, catches all thrown errors)        │
│                                                          │
│  ┌────────────────┐                                      │
│  │ Client Request │                                      │
│  └───────┬────────┘                                      │
│          ▼                                               │
│  ┌────────────────┐                                      │
│  │   compress     │─── response compression              │
│  │   caching      │─── ETag / Cache-Control              │
│  │   multipart    │─── multipart parsing                 │
│  └───────┬────────┘                                      │
│          ▼                                               │
│  ┌────────────────┐                                      │
│  │  rate-limit    │─── 429 if exceeded                   │
│  └───────┬────────┘                                      │
│          ▼                                               │
│  ┌────────────────┐                                      │
│  │  req-logger    │─── log method/URL/headers            │
│  └───────┬────────┘                                      │
│          ▼                                               │
│  ┌────────────────┐                                      │
│  │  auth-hook     │─── decorate helpers (non-blocking)   │
│  └───────┬────────┘                                      │
│          ▼                                               │
│  ┌────────────────┐                                      │
│  │ Route Handler  │                                      │
│  └───────┬────────┘                                      │
│          ▼                                               │
│  ┌────────────────┐                                      │
│  │   metrics      │─── Prometheus histogram (onResponse) │
│  └───────┬────────┘                                      │
│          ▼                                               │
│      Response                                            │
│                                                          │
│  any throw ──▶ { code, message }                         │
└──────────────────────────────────────────────────────────┘
```

## Core flows

### Registry asset serving

```
┌──────────────────────────────────┐
│ GET /registries/@rack/node/1.0.0 │
└────────────────┬─────────────────┘
                 │
                 ▼
         ┌──────────────┐
         │   parseURL   │
         └───────┬──────┘
                 │
                 ▼
        ┌────────────────┐
        │ ns allowlist?  │── no ──▶ 403
        └────────┬───────┘
             yes │
                 ▼
         ┌──────────────┐
         │  anonymous?  │
         └───────┬──────┘
            ┌────┴────┐
           yes       no
            │         │
            │         ▼
            │  ┌────────────┐
            │  │token valid?│
            │  └──────┬─────┘
            │    ┌────┴────┐
            │   yes       no
            │    │         │
            │    │         ▼
            │    │        401
            ▼    ▼
         ┌──────────────┐
         │   dispatch   │
         └───────┬──────┘
                 │
                 ├──▶ versions
                 ├──▶ latest
                 ├──▶ versioned
                 ├──▶ file
                 │
                 ▼
         ┌──────────────┐     ┌───────┐
         │  stream file │────▶│ reply │
         └──────────────┘     └───────┘
```

- `parseRegistryUrl()` → `{ type, path: { namespace, segments, version } }`
- `streamFileResponse()` → `stat()` for Content-Length + ETag, then `createReadStream` pipe

### Upload pipeline

```
┌─────────────────┐
│ POST /registries│
└────────┬────────┘
         │
         ▼
┌────────────┐   ┌──────────┐   ┌──────────┐   ┌────────┐   ┌─────────┐   ┌────────┐
│ receive    │──▶│ validate │──▶│ save to  │──▶│ SHA256 │──▶│ extract │──▶│ parse  │
│ upload     │   │ MIME     │   │ .tmp     │   │ verify │   │ tar.gz  │   │metadata│
└────────────┘   └──────────┘   └──────────┘   └────────┘   └─────────┘   └───┬────┘
                                                                              │
         ┌────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│  ns allowlist?  │
└────────┬────────┘
    ┌────┴────┐
   yes       no ──▶ 403
    │
    ▼
┌─────────────────┐
│  admin token?   │
└────────┬────────┘
    ┌────┴────┐
   yes       no
    │         │
    │         ▼
    │  ┌──────────────┐
    │  │  anonymous?  │
    │  └──────┬───────┘
    │    ┌────┴────┐
    │   no        yes ──▶ 403
    │    │
    │    ▼
    │  ┌──────────────┐
    │  │publish=true? │
    │  └──────┬───────┘
    │    ┌────┴────┐
    │   yes       no ──▶ 403
    │    │
    ▼    ▼
┌─────────────────┐   ┌──────────────────────────────┐   ┌─────────────────┐   ┌───────────────┐
│ schema validate │──▶│ install (local rename or R2) │──▶│ update versions │──▶│ emit webhooks │
└─────────────────┘   └──────────────────────────────┘   └─────────────────┘   └───────┬───────┘
                                                                                       │
         ┌─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│   201 Created   │
└─────────────────┘

on failure → temp files auto-cleaned
```

### Authentication & authorization

`auth.json` is the single source of truth for namespaces:

```
  ┌────────────────────────┐
  │ lookup in auth.json    │
  └──────────┬─────────────┘
          ┌────┴────┐
        found    not found ──▶ 403
          │
          ▼
  ┌───────────────┐
  │  has tokens?  │
  └───────┬───────┘
     ┌────┴────┐
    no        yes
     │         │
     ▼         ▼
  anonymous  auth required
```

Token verification:

```
┌────────────────────┐
│   extract token    │─── Bearer / X-Registry-Token / null
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ has token config?  │
└─────────┬──────────┘
     ┌────┴────┐
    yes       no ──▶ allowed (anonymous)
     │
     ▼
┌────────────────────┐
│    has token?      │
└─────────┬──────────┘
     ┌────┴────┐
    yes       no ──▶ 401 UNAUTHORIZED
     │
     ▼
┌────────────────────┐
│   token match?     │
└─────────┬──────────┘
     ┌────┴────┐
    yes       no ──▶ 401 INVALID_TOKEN
     │
     ▼
┌────────────────────┐
│     expired?       │
└─────────┬──────────┘
     ┌────┴────┐
     no      yes ──▶ 401 TOKEN_EXPIRED
     │
     ▼
┌────────────────────┐
│     allowed        │
│   (authorized)     │
└────────────────────┘
```

### Webhook delivery

```
┌───────────────┐
│   emitEvent   │
└───────┬───────┘
        ▼
┌───────────────┐
│    filter     │─── enabled && events match
└───────┬───────┘
        ▼
┌───────────────┐
│ build payload │
└───────┬───────┘
        ▼
┌───────────────┐
│    enqueue    │─── async, non-blocking
└───────┬───────┘
        ▼
┌─ drain loop ────────────────────────────────┐
│                                             │
│  ┌───────────┐                              │
│  │  sort by  │                              │
│  │nextRetryAt│                              │
│  └─────┬─────┘                              │
│        ▼                                    │
│  ┌───────────┐                              │
│  │   due?    │── no ──▶ setTimeout          │
│  └─────┬─────┘                              │
│    yes │                                    │
│        ▼                                    │
│  ┌───────────┐                              │
│  │  deliver  │─── HMAC sign + fetch (30s)   │
│  └──┬─────┬──┘                              │
│  2xx│     │fail                             │
│     ▼     ▼                                 │
│  ┌─────┐ ┌──────────┐                       │
│  │done │ │attempt<4?│                       │
│  └─────┘ └──┬────┬──┘                       │
│          yes│    │no                        │
│             ▼    ▼                          │
│          retry  drop                        │
│        2s/4s/8s                             │
│                                             │
│  queue empty ──▶ done                       │
└─────────────────────────────────────────────┘
```

## Error handling

All errors follow `throw` → `error-handler` → `{ code, message }`:

```
                    ┌───────────┐
                    │  AppError │
                    └─────┬─────┘
                          │
       ┌──────────┬───────┼───────┬──────────┐
       ▼          ▼       ▼       ▼          ▼
┌────────────┐┌────────┐┌────────┐┌────────┐┌────────┐
│ Validation ││Forbid- ││NotFound││Conflict││Rate-   │
│ Error      ││den     ││Error   ││Error   ││Limit   │
│ 400        ││403     ││404     ││409     ││429     │
└────────────┘└────────┘└────────┘└────────┘└────────┘

Fastify built-in errors ──▶ statusCode + code
Unknown errors          ──▶ 500 INTERNAL_SERVER_ERROR
```

- `ValidationError` (400), `ForbiddenError` (403), `NotFoundError` (404), `ConflictError` (409), `RateLimitError` (429)
- Nothing manually `reply.send()`s error bodies; error-handler formats them consistently

## Storage layout

All filesystem work is under `STORAGE_ROOT` (default `packages/storage`) with this layout:

```
packages/storage/
├── .healthcheck                              # health marker (empty file; presence = healthy)
│
├── @rack/                                    # namespace (starts with @)
│   ├── runtimes/node/                        # registry (may be multi-segment)
│   │   ├── versions.json                     # { "versions": ["1.1.0", "1.0.0"] }
│   │   ├── 1.0.0/                            # version dir (SemVer)
│   │   │   ├── registry.json                 # registry manifest
│   │   │   └── templates/                    # template files
│   │   │       └── src/index.ts
│   │   └── 1.1.0/
│   │       └── registry.json
│   └── quality/eslint/
│       ├── versions.json
│       └── 1.0.0/
│           ├── registry.json
│           └── templates/
│
├── presets/                                  # preset configs
│   └── node/
│       └── preset.json
│
├── schema/                                   # JSON Schema
│   ├── rack.json
│   ├── preset.json
│   └── registry-item.json
│
└── .tmp/                                     # upload temp dir (created/cleaned automatically)
```

Key conventions:

- **Namespace discovery**: `StorageService.findNamespaces()` scans top-level dirs starting with `@`
- **Registry discovery**: `StorageService.findRegistries()` recursively scans paths that contain SemVer child dirs
- **Version dirs**: directory names matching `^\d+\.\d+\.\d+`; `latest`, `v1.0.0`, etc. are ignored
- **versions.json**: generated on upload, SemVer descending; `getLatestPath()` uses `versions[0]`
- **Path safety**: every `resolve*Path()` calls `assertWithinRoot()` to block path traversal
- **Schema location**: `SCHEMA_DIR` defaults to `<STORAGE_ROOT>/schema` (co-located for local dev). The Docker image overrides it to `/app/schema` so schemas travel with the image and a named `/data` volume can't shadow them.

## Configuration model

Three sources, non-overlapping responsibilities:

| Source                                          | Contents                                                            | How to change        |
| ----------------------------------------------- | ------------------------------------------------------------------- | -------------------- |
| **Environment** (`config.ts`)                   | Deployment: port, paths, log level, admin token                     | Edit `.env`, restart |
| **Compile-time constants** (`constants.ts`)     | Safety limits: upload size, rate limits, timeouts, schema allowlist | Change code, rebuild |
| **File config** (`auth.json` / `webhooks.json`) | Runtime data: tokens, webhook URLs                                  | Edit file, restart   |
