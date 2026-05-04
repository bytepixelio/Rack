---
aside: false
---

# Publishing Registry

Publish custom registries to the Registry Server to make them available for CLI tools.

## Prepare Registry

Before publishing, ensure your registry structure is correct.

### Registry Directory Structure

```
my-registry/
├── registry.json           # Required: Registry configuration file
├── templates/              # Optional: Template files
│   ├── src/
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
└── ...                     # Other files
```

### registry.json Example

```json
{
  "$schema": "https://registry.rackjs.com/schemas/registry-item.json",
  "name": "my-tool",
  "namespace": "@company",
  "version": "1.0.0",
  "type": "registry:feature",
  "priority": 4,
  "description": "My custom tool",
  "files": [
    {
      "target": "src/config.ts",
      "path": "./templates/src/config.ts",
      "type": "registry:lib"
    }
  ],
  "dependencies": {
    "lodash": "^4.17.21"
  },
  "devDependencies": {
    "typescript": "^5.9.2"
  }
}
```

::: tip Schema Validation
Using the `$schema` field provides IntelliSense and validation in your editor.
:::

## Package Registry

Package the registry in tar.gz format.

### Using tar Command

```bash
# Navigate to the parent directory of the Registry
cd /path/to/registries

# Package (ensure registry.json is in the root)
tar -czf my-tool-1.0.0.tar.gz my-tool/

# Verify package contents
tar -tzf my-tool-1.0.0.tar.gz

# Expected output
# my-tool/registry.json
# my-tool/templates/src/config.ts
# ...
```

::: warning Package Structure Requirements
- `registry.json` must be in the first-level directory of the archive
- All files referenced in `files[].path` must be included in the package
- Recommended naming format: `<name>-<version>.tar.gz`
:::

## Calculate SHA256 Checksum

The upload requires a `checksum` field in the multipart form. Use `sha256sum` on Linux or `shasum -a 256` on macOS:

```bash
sha256sum my-tool-1.0.0.tar.gz | awk '{print $1}'
# Or on macOS:
shasum -a 256 my-tool-1.0.0.tar.gz | awk '{print $1}'
```

## Upload to Server

Use the `POST /registries` API to upload registry packages.

### Using curl

```bash
# Set variables
SERVER_URL="https://registry.company.com"
TOKEN="your-publish-token"
PACKAGE="my-tool-1.0.0.tar.gz"
CHECKSUM=$(sha256sum "$PACKAGE" | awk '{print $1}')

# Upload with namespace token
curl -X POST "$SERVER_URL/registries" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$PACKAGE" \
  -F "checksum=$CHECKSUM"
```

### Using Admin Token

If the server has `ADMIN_TOKEN` configured, you can use it to publish to any namespace without per-namespace token configuration:

```bash
curl -X POST "$SERVER_URL/registries" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -F "file=@$PACKAGE" \
  -F "checksum=$CHECKSUM"
```

::: tip Admin Token vs Namespace Token
- **Namespace token**: Configured per-namespace in `auth.json`, requires `publish: true` permission
- **Admin token**: Set via `ADMIN_TOKEN` environment variable, bypasses namespace-level auth for uploads
  :::

::: tip Accepted Content-Type

The server validates the MIME type of the uploaded file. The following values are accepted:

- `application/gzip`
- `application/x-gzip`
- `application/x-tar`
- `application/x-compressed`
- `application/octet-stream`

:::

### Success Response

```json
{
  "message": "Registry uploaded successfully",
  "namespace": "@company",
  "name": "my-tool",
  "version": "1.0.0",
  "path": "@company/my-tool/1.0.0"
}
```

### Common Errors

#### 1. Missing Authentication Token

```json
{
  "code": "UNAUTHORIZED",
  "message": "Authentication token is required"
}
```

**Solution**: Add token

```bash
-H "Authorization: Bearer YOUR_TOKEN"
```

#### 2. Insufficient Token Permissions

```json
{
  "code": "INSUFFICIENT_PERMISSIONS",
  "message": "Token does not have publish permission for namespace @company"
}
```

**Solution**: Add `publish: true` to the token in `auth.json`, or use an admin token

#### 3. Anonymous Namespace Upload Forbidden

```json
{
  "code": "ANONYMOUS_UPLOAD_FORBIDDEN",
  "message": "Anonymous namespaces do not allow uploads. Use an admin token or configure namespace tokens."
}
```

**Solution**: Configure tokens for the namespace in `auth.json`, or use the `ADMIN_TOKEN`

#### 4. Checksum Mismatch

```json
{
  "code": "CHECKSUM_MISMATCH",
  "message": "Checksum verification failed",
  "expected": "abc123...",
  "actual": "def456..."
}
```

**Solution**: Recalculate the correct checksum

#### 5. Version Already Exists

```json
{
  "code": "VERSION_EXISTS",
  "message": "Registry @company/my-tool@1.0.0 already exists"
}
```

**Solution**: Use a new version number

#### 6. Namespace Not Allowed

```json
{
  "code": "FORBIDDEN_NAMESPACE",
  "message": "Namespace not allowed"
}
```

**Solution**: Add the namespace as a key in `auth.json`

## CI/CD Integration

Integrate the publishing process into your CI/CD pipeline.

### GitHub Actions

Create `.github/workflows/publish-registry.yml`:

```yaml
name: Publish Registry

on:
  push:
    tags:
      - 'v*.*.*'

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Extract version
        id: version
        run: echo "VERSION=${GITHUB_REF#refs/tags/v}" >> $GITHUB_OUTPUT

      - name: Pack registry
        run: |
          tar -czf registry-${{ steps.version.outputs.VERSION }}.tar.gz \
            -C registries my-registry/

      - name: Calculate checksum
        id: checksum
        run: |
          CHECKSUM=$(sha256sum registry-${{ steps.version.outputs.VERSION }}.tar.gz | awk '{print $1}')
          echo "CHECKSUM=$CHECKSUM" >> $GITHUB_OUTPUT

      - name: Upload to Registry Server
        env:
          REGISTRY_TOKEN: ${{ secrets.REGISTRY_TOKEN }}
          REGISTRY_URL: ${{ secrets.REGISTRY_URL }}
        run: |
          curl -X POST "$REGISTRY_URL/registries" \
            -H "Authorization: Bearer $REGISTRY_TOKEN" \
            -F "file=@registry-${{ steps.version.outputs.VERSION }}.tar.gz" \
            -F "checksum=${{ steps.checksum.outputs.CHECKSUM }}"
```

Configure GitHub Secrets:
- `REGISTRY_TOKEN` - Publishing token (namespace token or admin token)
- `REGISTRY_URL` - Registry Server URL

> Other CI platforms (GitLab CI, CircleCI, etc.) follow the same pattern: in a tag-triggered job, run `tar -czf ... && sha256sum ... && curl -X POST $REGISTRY_URL/registries`, injecting `REGISTRY_TOKEN` and `REGISTRY_URL` via environment variables.

## Version Management

### Semantic Versioning

Registry versions should follow [SemVer](https://semver.org/) specification:

```
MAJOR.MINOR.PATCH

1.0.0 → 1.0.1 (Patch update, bug fixes)
1.0.1 → 1.1.0 (Minor update, new features)
1.1.0 → 2.0.0 (Major update, breaking changes)
```

### Version List

After successful upload, Registry Server automatically updates `versions.json`:

```json
{
  "versions": ["1.1.0", "1.0.1", "1.0.0"]
}
```

Versions are sorted in descending order, with the latest version first.

### Manually Maintain the Version List

`versions.json` is maintained automatically by the upload pipeline. If you add or remove version directories directly on the server's filesystem, you must keep the corresponding `<storage>/<namespace>/<name>/versions.json` in sync (descending order); the server uses its contents to resolve "latest version". Prefer publishing via `POST /registries` to avoid manual editing.

## Webhook Notifications

When a registry is successfully uploaded, webhook notifications are triggered (if configured).

### Webhook Event

```json
{
  "event": "uploaded",
  "timestamp": "2025-11-07T10:30:00.000Z",
  "namespace": "@company",
  "name": "my-tool",
  "version": "1.0.0",
  "path": "@company/my-tool/1.0.0"
}
```

### Use Cases

- **CI/CD Trigger** - Automatic builds and deployments
- **Notifications** - Send Slack/DingTalk messages
- **Documentation Generation** - Automatically generate and publish documentation
- **Testing** - Trigger automated tests

## Verify Publication

Verify that the registry is available after publishing:

```bash
# View version list
curl https://registry.company.com/registries/@company/my-tool/versions

# Expected output
# {"versions":["1.0.0"]}

# Get latest registry configuration
curl https://registry.company.com/registries/@company/my-tool

# Get specific version
curl https://registry.company.com/registries/@company/my-tool/1.0.0
```

Test using CLI:

```bash
# Configure namespace
rk config set @company --url https://registry.company.com

# Add registry
rk add @company/my-tool

# View installed registries
cat rack.json
```
