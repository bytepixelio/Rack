---
aside: false
---

# 认证

当使用私有 Registry 源时, 如需访问受保护的资源, 可配置认证信息。

## 为什么需要认证？

#### 保护企业资产

企业内部的 Registry 包含专有配置、工具和代码模板, 需要限制访问权限。

```bash
# 公开源 - 无需认证
rk add @rack/runtimes/node

# 私有源 - 需要认证
rk add @company/internal-tools
```

#### 访问控制

不同团队或项目可能有不同的访问权限。

```bash
# 团队 A 的私有源
rk config set @team-a --url https://registry.team-a.com --token team-a-token-value

# 团队 B 的私有源
rk config set @team-b --url https://registry.team-b.com --token team-b-token-value
```

## 认证方式

Rack 支持两种认证方式。

### Bearer Token

最常用的认证方式, 使用 `--token` 参数; CLI 在发起请求时会自动展开为 `Authorization: Bearer <token>` 请求头。

```bash
rk config set @company --url https://registry.company.com --token your-token-here
```

**命令输出：**
```
✓ Registry @company configured successfully

Configuration for @company:
  URL:      https://registry.company.com
  Headers:
    Authorization -> Bearer your-token-here
```

**生成的配置（~/.rackrc）**

`token` 在文件中独立保存, 不会被写到 `headers` 内; CLI 在 `rk config get/list` 与发起 HTTP 请求时才会临时展开为 `Authorization` 请求头。

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

### 自定义请求头

使用 `--header` 参数添加自定义 HTTP 请求头, 格式为 `Key: Value`。

```bash
rk config set @company --url https://registry.company.com \
  --header "X-API-Key: your-api-key" \
  --header "X-Client-Version: 1.0.0"
```

**命令输出：**
```
✓ Registry @company configured successfully

Configuration for @company:
  URL:      https://registry.company.com
  Headers:
    X-API-Key -> your-api-key
    X-Client-Version -> 1.0.0
```

**生成的配置（~/.rackrc）**

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

### 组合使用

可以同时使用 `--token` 和 `--header` 参数。

```bash
rk config set @company --url https://registry.company.com \
  --token your-token-here \
  --header "X-Environment: production" \
  --header "X-Team: frontend"
```

**命令输出：**
```
✓ Registry @company configured successfully

Configuration for @company:
  URL:      https://registry.company.com
  Headers:
    Authorization -> Bearer your-token-here
    X-Environment -> production
    X-Team -> frontend
```

**生成的配置（~/.rackrc）**

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

> 当前版本的 `rk config get/list` 不会对 Token 或敏感请求头做掩码, 请确保终端输出与 `~/.rackrc` 仅由可信用户访问。

## 故障排查

### 认证失败

**错误信息**

```
Error: 401 Unauthorized
Failed to fetch @company/ui-kit
```

**原因**

- Token 已过期
- Token 无效
- 没有配置认证

### 权限不足

**错误信息**

```
Error: 403 Forbidden
Access denied for @company/ui-kit
```

**原因**

- Token 权限不足
- Token 的作用域不包括该 Registry
