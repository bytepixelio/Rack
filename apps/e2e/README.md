# @rack/e2e

End-to-end tests for the Rack CLI + registry server. Runs the real built
CLI binary against an in-process server pointing at `packages/storage`.

## Running

```bash
pnpm test:e2e                             # from repo root (via turbo)
pnpm --filter @rack/e2e test:e2e          # direct

pnpm --filter @rack/e2e test:e2e -- --reporter=verbose   # per-case names
pnpm --filter @rack/e2e test:e2e -- -t prettier          # filter by name
cd apps/e2e && pnpm vitest                               # watch mode
```

Turbo runs `^build` first, so the CLI's `dist/bin.js` is always fresh.

### Against a live registry

Set `RACK_REGISTRY_URL` to skip the in-process server and point every
`startServer()`-backed test at a deployed URL. Used for post-deploy smoke
against `registry.rackjs.com` (or a staging / self-hosted environment):

```bash
# Read-only: exercises the CLI install path against the deployed registry
RACK_REGISTRY_URL=https://registry.rackjs.com pnpm --filter @rack/e2e test:e2e

# Read + write: also hits POST /registries on the Server (use for local or
# r2-mode deployments where writes are sent to the Server and reads to the
# Worker / Server respectively)
RACK_REGISTRY_URL=https://registry.rackjs.com \
RACK_SERVER_URL=https://your-server \
RACK_ADMIN_TOKEN=xxx \
pnpm --filter @rack/e2e test:e2e
```

Suite behavior in remote mode:

- `materials` / `presets` / `errors` — run against the read URL, exercising
  every `@rack/*` module and preset in the current checkout's
  `packages/storage`. Run **after** the deployed content is in sync.
- `pipeline` — auto-skips (toy `@toy/*` fixtures only exist in-process).
- `uploads` — runs only when `RACK_SERVER_URL` **and** `RACK_ADMIN_TOKEN`
  are set; otherwise auto-skips. When it runs, the upload smoke fixture
  (`@rack/e2e-upload-smoke@0.0.0`) is POSTed to the Server — the target
  gains that path if absent. Point at a deployment you control.

## Layout

### `src/` — infrastructure

| File            | Role                                                                    |
| --------------- | ----------------------------------------------------------------------- |
| `server.ts`     | Start in-process Fastify on port 0; returns ephemeral URL + optional token |
| `cli.ts`        | Run built `apps/cli/dist/bin.js` via execa                              |
| `workspace.ts`  | `mkdtemp` sandbox with `home/.rackrc` + empty `work/` cwd               |
| `discover.ts`   | Glob `packages/storage` for registries and presets                      |
| `baseline.ts`   | Verify `files[].target` + deps / devDeps / scripts merge                |
| `assertions.ts` | `smoke.json` loader + executor (files / json / text)                    |
| `upload.ts`     | Build smoke tar.gz + POST multipart to `/registries`                    |

### `tests/` — test files

| File                | Scope                                                      |
| ------------------- | ---------------------------------------------------------- |
| `materials.test.ts` | Every `@rack/*` module via `rk add`; idempotency           |
| `presets.test.ts`   | Every preset via `rk init --ci`; composed-state checks    |
| `pipeline.test.ts`  | Toy fixtures for pipeline mechanics (e.g. dep chain)       |
| `errors.test.ts`    | Negative paths (unknown id, invalid namespace)             |
| `uploads.test.ts`   | `POST /registries` surface: admin token, duplicate, auth   |

### `fixtures/storage/` — toy modules

Minimal synthetic modules used only by `pipeline.test.ts`. Separate from
`packages/storage` so their semantics stay frozen regardless of how real
modules evolve.

### `fixtures/upload-fixture/` — upload smoke package

Minimal valid registry (`@rack/e2e-upload-smoke@0.0.0`) tarred on demand by
`uploads.test.ts`. Kept out of `packages/storage` so `materials.test.ts`
doesn't try to install it.

## Adding coverage

### A new registry under `packages/storage`

Drop a `registry.json` (and any template files) into
`packages/storage/@<ns>/<path>/<version>/`. No test code change needed —
`materials.test.ts` picks it up automatically through `discoverRegistries`.

### Stricter per-module invariants

Add a `smoke.json` next to the module's `registry.json`:

```
packages/storage/@rack/build/typescript/1.0.0/
├── registry.json
├── smoke.json            ← new
└── templates/
```

Schema:

```json
{
  "files": {
    "exist":  ["tsconfig.json"],
    "absent": ["tsconfig.build.json"]
  },
  "json": {
    "tsconfig.json": {
      "compilerOptions.strict": true,
      "compilerOptions.target": { "exists": true }
    }
  },
  "text": {
    ".gitignore": { "contains": ["node_modules"] }
  }
}
```

Matchers inside `json.<file>.<dotPath>`:

| Form                      | Meaning                                    |
| ------------------------- | ------------------------------------------ |
| Literal value             | deep-equal                                 |
| `{ "exists": true }`      | dot-path resolves to a non-undefined value |
| `{ "contains": "foo" }`   | string includes / array includes           |
| `{ "matches": "^pat$" }`  | regex test on string                       |

`smoke.json` runs automatically in both `rk add <id>` solo context and
preset composition context, so merge-strategy regressions that drop a
contributor are surfaced by existing assertions.

### A new pipeline-level edge case

Add a toy module under `fixtures/storage/@toy/...` and a new case in
`pipeline.test.ts`. Use this lane (not real modules) when pinning a
mechanic — `registryDependencies` chain, custom `mergeStrategy`,
version conflict resolution, etc.

## Design notes

- Tests exercise the **built** CLI (`dist/bin.js`) — shebang / bundle /
  commander wiring regressions surface here, not only in unit tests.
- Server starts via in-process `buildApp()` on `port:0` — no subprocess
  management, no port conflicts.
- Per-case `mkdtemp` workspace with `HOME` rewrite — zero impact on the
  developer's real `~/.rackrc`.
- No coverage threshold — E2E is protocol-level, not unit-level. Unit
  coverage lives in `apps/cli/vitest.config.ts` (100 % enforced).
