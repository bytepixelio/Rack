---
aside: false
---

# Authentication

When using private registry sources, you can configure authentication information to access protected resources.

## Why Authentication?

#### Protect Enterprise Assets

Internal enterprise registries contain proprietary configurations, tools, and code templates that require access control.

```bash
# Public source - no authentication needed
rk add @rack/runtimes/node

# Private source - requires authentication
rk add @company/internal-tools
```

#### Access Control

Different teams or projects may have different access permissions.

```bash
# Team A's private source
rk config set @team-a --url https://registry.team-a.com --token team-a-token-value

# Team B's private source
rk config set @team-b --url https://registry.team-b.com --token team-b-token-value
```

## Authentication Methods

Rack supports two authentication methods.

### Bearer Token

The most common authentication method. Use the `--token` parameter; the CLI expands it into an `Authorization: Bearer <token>` header when sending requests.

```bash
rk config set @company --url https://registry.company.com --token your-token-here
```

**Command output:**
```
✓ Registry @company configured successfully

Configuration for @company:
  URL:      https://registry.company.com
  Headers:
    Authorization -> Bearer your-token-here
```

**Generated configuration (~/.rackrc)**

`token` is stored as its own top-level field — it is not written into `headers`. The CLI expands it into an `Authorization` header only when displaying the entry via `rk config get/list` or sending an HTTP request.

```json
{
  "registries": {
    "@company": {
      "url": "https://registry.company.com",
      "token": "your-token-here"
    }
  }
}
```

### Custom Headers

Use the `--header` parameter to add custom HTTP request headers, formatted as `Key: Value`.

```bash
rk config set @company --url https://registry.company.com \
  --header "X-API-Key: your-api-key" \
  --header "X-Client-Version: 1.0.0"
```

**Command output:**
```
✓ Registry @company configured successfully

Configuration for @company:
  URL:      https://registry.company.com
  Headers:
    X-API-Key -> your-api-key
    X-Client-Version -> 1.0.0
```

**Generated configuration (~/.rackrc)**

```json
{
  "registries": {
    "@company": {
      "url": "https://registry.company.com",
      "headers": {
        "X-API-Key": "your-api-key",
        "X-Client-Version": "1.0.0"
      }
    }
  }
}
```

### Combined Usage

You can use both `--token` and `--header` parameters together.

```bash
rk config set @company --url https://registry.company.com \
  --token your-token-here \
  --header "X-Environment: production" \
  --header "X-Team: frontend"
```

**Command output:**
```
✓ Registry @company configured successfully

Configuration for @company:
  URL:      https://registry.company.com
  Headers:
    Authorization -> Bearer your-token-here
    X-Environment -> production
    X-Team -> frontend
```

**Generated configuration (~/.rackrc)**

```json
{
  "registries": {
    "@company": {
      "url": "https://registry.company.com",
      "headers": {
        "X-Environment": "production",
        "X-Team": "frontend"
      },
      "token": "your-token-here"
    }
  }
}
```

> The current version of `rk config get/list` does not mask tokens or sensitive headers — make sure the terminal output and `~/.rackrc` are only accessible to trusted users.

## Namespace Discovery

Authentication also affects namespace discovery endpoints. Token-gated namespaces are hidden from unauthenticated callers so that namespace names and registry lists are not leaked.

| Endpoint                          | Behavior                                                                 |
| --------------------------------- | ------------------------------------------------------------------------ |
| `GET /namespaces`                 | Returns only namespaces the caller can access; gated namespaces are omitted |
| `GET /namespaces/:ns/registries`  | Requires valid token for non-anonymous namespaces; returns 401/403 otherwise |

```bash
# Anonymous — only sees public namespaces
curl https://registry.company.com/namespaces
# { "namespaces": ["@rack", "@public"] }

# Authenticated — also sees gated namespaces
curl -H "Authorization: Bearer <token>" https://registry.company.com/namespaces
# { "namespaces": ["@rack", "@public", "@company"] }
```

::: tip Admin Token
When an admin token is provided, `GET /namespaces` returns all namespaces without filtering.
:::

## Troubleshooting

### Authentication Failure

**Error message**

```
Error: 401 Unauthorized
Failed to fetch @company/ui-kit
```

**Reasons**

- Token has expired
- Token is invalid
- Authentication not configured

### Insufficient Permissions

**Error message**

```
Error: 403 Forbidden
Access denied for @company/ui-kit
```

**Reasons**

- Token has insufficient permissions
- Token scope doesn't include this registry
