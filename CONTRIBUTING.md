# Contributing

Thanks for your interest in Rack. This guide covers local setup, the CI pipeline, and what to configure if you fork the repo.

## Local setup

```bash
pnpm install
pnpm build
pnpm test
```

Required: Node.js ≥ 22.10.0, pnpm ≥ 10.8.0. See the root [`README.md`](./README.md#quick-start) for CLI quickstart and per-app setup in each `apps/*/README.md`.

Commits must follow [Conventional Commits](https://www.conventionalcommits.org/) (enforced by commitlint). Run `pnpm commit` for a guided prompt.

## CI pipeline

Three GitHub Actions workflows live under `.github/workflows/`:

| Workflow             | Triggers on                                                 | What it does                                                                                                   |
| -------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `ci.yml`             | Every push / PR                                             | Build + lint + test across all apps. Runs changesets on `main` to either open a Version PR or publish to npm.  |
| `deploy-worker.yml`  | Push to `main` touching `apps/registry-worker/**` or itself | Deploys the Cloudflare Worker, then runs a post-deploy smoke test that exercises the Server → R2 → Worker roundtrip. |
| `sync-auth.yml`      | Push to `main` touching `config/auth.json` or itself        | Uploads `config/auth.json` to R2 at `.auth/auth.json`, then hits an anonymous-read endpoint to confirm the Worker still parses it. |

## Forking: what to configure

If you fork Rack and want the workflows to run against your own infrastructure, you need:

### 1. Cloudflare + R2 setup

- A Cloudflare account with Workers and R2 enabled
- An R2 bucket (default name: `rack-registry` — or your own)
- A deployed Worker route pointing at the bucket (see [`apps/registry-worker/README.md`](./apps/registry-worker/README.md))
- R2 API credentials (Access Key ID + Secret Access Key) from R2 → Manage R2 API Tokens

### 2. Repository secrets

Add these under **Settings → Secrets and variables → Actions**:

| Secret                  | Used by                                                | How to obtain                                                                                                        |
| ----------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | `deploy-worker.yml`, `sync-auth.yml`                   | Cloudflare → My Profile → API Tokens. Scopes: `Workers Scripts:Edit` + `Workers R2 Storage:Edit`.                    |
| `CLOUDFLARE_ACCOUNT_ID` | `deploy-worker.yml`, `sync-auth.yml`                   | Cloudflare dashboard → account home (right sidebar).                                                                 |
| `R2_BUCKET_NAME`        | `deploy-worker.yml` (post-deploy smoke)                | Your R2 bucket name.                                                                                                 |
| `R2_ACCOUNT_ID`         | `deploy-worker.yml` (post-deploy smoke)                | Same as `CLOUDFLARE_ACCOUNT_ID` — kept separate so the smoke step stays self-contained.                              |
| `R2_ACCESS_KEY_ID`      | `deploy-worker.yml` (post-deploy smoke)                | R2 → Manage R2 API Tokens → Create API Token (Object Read & Write).                                                  |
| `R2_SECRET_ACCESS_KEY`  | `deploy-worker.yml` (post-deploy smoke)                | Paired with `R2_ACCESS_KEY_ID`, shown once at token creation.                                                        |
| `NPM_TOKEN`             | `ci.yml` (changesets publish on `main`)                | npm → Access Tokens → Generate (Automation). Only needed if you publish the CLI to npm; safe to omit otherwise.      |

### 3. Values that are currently hardcoded

These are not secrets but are baked into the workflows pointing at `rackjs.com`. Change them to match your deployment:

| Location                                                                       | Value                             | What to change it to                   |
| ------------------------------------------------------------------------------ | --------------------------------- | -------------------------------------- |
| `.github/workflows/deploy-worker.yml` — Post-deploy health check               | `https://registry.rackjs.com/health` | Your Worker's health URL               |
| `.github/workflows/deploy-worker.yml` — Run upload roundtrip → `RACK_REGISTRY_URL` | `https://registry.rackjs.com`     | Your Worker's base URL                 |
| `.github/workflows/sync-auth.yml` — Post-sync read check                       | `https://registry.rackjs.com/...` | Same base URL                          |
| `apps/registry-worker/wrangler.toml`                                           | routes and bucket binding         | Your zone + bucket                     |

### 4. About the `@rack/e2e-upload-smoke` fixture

The deploy-worker smoke test uploads a fixture package named `@rack/e2e-upload-smoke@0.0.0` to your R2 bucket on every run, and the workflow cleans it up both before the test starts and after the test finishes (regardless of pass/fail). You can ignore it — it's test data that never leaks out of the `@rack` namespace. If you rename your namespaces in `config/auth.json`, you may also want to adjust `apps/e2e/tests/uploads.test.ts` and the cleanup step's prefix accordingly.

## Releases

Versioning is managed by [Changesets](https://github.com/changesets/changesets):

```bash
pnpm changeset          # create a changeset (select package, bump type, summary)
```

Push the changeset to `main`; a "Version Packages" PR will be auto-opened. Merging that PR triggers npm publish via `ci.yml`.

## Where to look for X

See the table in the root [`CLAUDE.md`](./CLAUDE.md#where-to-look-for-x) — it's the canonical map from "I want to know X" to the right file.
