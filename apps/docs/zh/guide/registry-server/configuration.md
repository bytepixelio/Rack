---
aside: false
---

# 配置指南

Registry Server 提供了丰富的配置选项, 可以通过环境变量、配置文件来定制服务行为。

## 环境变量配置

### 创建配置文件

在 `apps/registry-server` 目录下创建 `.env` 文件:

```bash
cd apps/registry-server
cp .env.example .env
```

### 基础配置

| 变量名        | 默认值        | 说明                                                                                                                     |
| ------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `PORT`        | `8080`        | 服务监听端口                                                                                                             |
| `HOST`        | `0.0.0.0`     | 服务绑定地址                                                                                                             |
| `NODE_ENV`    | `development` | 运行环境                                                                                                                 |
| `LOG_LEVEL`   | `info`        | 日志级别                                                                                                                 |
| `TRUST_PROXY` | `false`       | 是否信任 `X-Forwarded-For`。值: `true` / `false` / 正整数跳数。反向代理后必须设置, 否则速率限制按代理 IP 聚合 (见 §6.19) |

**示例配置**

```bash
# .env
PORT=8080
HOST=0.0.0.0
NODE_ENV=production
LOG_LEVEL=info
# Nginx / ALB / Cloudflare Tunnel 后: 信任 X-Forwarded-For
TRUST_PROXY=true
```

::: tip 监听地址

- `0.0.0.0` - 监听所有网卡 (适合服务器部署)
- `127.0.0.1` - 仅本地访问 (适合开发环境)
  :::

### 存储配置

| 变量名                 | 默认值                   | 说明                                             |
| ---------------------- | ------------------------ | ------------------------------------------------ |
| `STORAGE_ROOT`         | `../../packages/storage` | 静态资源根目录 (相对路径)                        |
| `STORAGE_BACKEND`      | `local`                  | 上传存储后端: `local` 或 `r2`                    |
| `R2_BUCKET_NAME`       | —                        | R2 桶名称 (`STORAGE_BACKEND=r2` 时必填)          |
| `R2_ACCOUNT_ID`        | —                        | Cloudflare 账户 ID (`STORAGE_BACKEND=r2` 时必填) |
| `R2_ACCESS_KEY_ID`     | —                        | R2 API 访问密钥 ID (`STORAGE_BACKEND=r2` 时必填) |
| `R2_SECRET_ACCESS_KEY` | —                        | R2 API 访问密钥 (`STORAGE_BACKEND=r2` 时必填)    |

**示例配置 (本地)**

```bash
# 使用相对路径
STORAGE_ROOT=../../packages/storage

# 使用绝对路径 (推荐生产环境)
STORAGE_ROOT=/data/registry-storage
```

**示例配置 (R2)**

```bash
STORAGE_BACKEND=r2
R2_BUCKET_NAME=rack-registry
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key-id
R2_SECRET_ACCESS_KEY=your-secret-access-key
```

::: tip 存储后端
当 `STORAGE_BACKEND=local` (默认) 时, 上传的包存储在 `STORAGE_ROOT` 指定的本地文件系统中, 读写都由 Server 完成。当 `STORAGE_BACKEND=r2` 时, 上传的包会推送到 Cloudflare R2 桶, **读取则由 Cloudflare Worker 从 R2 直接在边缘分发** (`registry.rackjs.com` 或你自定义的 Worker 域名)。两种模式的上传处理 (临时文件、校验、解压) 均在本地完成, 仅最终存储目标不同。

⚠️ r2 模式下 Server 不再写入本地盘, 其 `GET /registries/**` 路由仍存在但本地为空, 直接打 Server 读会 404。客户端 (Rack CLI、浏览器、CI) 的读取地址必须指向 Worker 域名; 上传 (`POST /registries`) 仍然打 Server。具体部署拓扑见 [部署概述](./overview.md#存储模式与部署拓扑)。
:::

::: warning 路径规范

- 相对路径: 相对于 `apps/registry-server` 目录
- 绝对路径: 推荐在生产环境使用, 避免路径混淆
  :::

### 认证配置

| 变量名             | 默认值                   | 说明                                                               |
| ------------------ | ------------------------ | ------------------------------------------------------------------ |
| `AUTH_CONFIG_PATH` | `../../config/auth.json` | auth.json 配置文件路径 (仓库根 `config/auth.json`, 与 Worker 共用) |
| `ADMIN_TOKEN`      | _(未设置)_               | 系统级管理员 Token, 跨命名空间读取与发布均跳过命名空间级认证       |

**示例配置**

```bash
# 认证配置 (默认读仓库根 config/auth.json, 与 Worker 共用)
# AUTH_CONFIG_PATH=../../config/auth.json

# Admin Token (可选, 启用跨命名空间读取与发布)
ADMIN_TOKEN=your-secret-admin-token
```

::: tip Admin Token
`ADMIN_TOKEN` 是系统级主密钥, 持有者无需在 `auth.json` 中配置命名空间 Token, 即可读取并发布到任意命名空间。请求携带此 Token 时, 读取 (`GET /registries/*`、`GET /namespaces`) 和上传都会跳过命名空间级别的认证检查。适用于需要跨多个命名空间运维的 CI/CD 系统。
:::

::: tip R2 模式下 auth.json 需要同步到 R2
`STORAGE_BACKEND=r2` 模式下, Cloudflare Worker 从同一个 R2 桶里读 `.auth/auth.json` 来鉴权读请求, Server 仍然读仓库根的文件来管控上传。[`sync-auth.yml`](https://github.com/bytepixelio/Rack/blob/main/.github/workflows/sync-auth.yml) workflow 会在每次 push 时把 `config/auth.json` 上传到 R2 —— 没有这个同步 (或没有手动把 `auth.json` 放到 R2 的 `.auth/auth.json` 路径), Worker 对所有命名空间读请求都会返回 403。
:::

### Webhook 配置

| 变量名                | 默认值                 | 说明                       |
| --------------------- | ---------------------- | -------------------------- |
| `WEBHOOK_CONFIG_PATH` | `config/webhooks.json` | webhooks.json 配置文件路径 |

### 完整示例

```bash
# apps/registry-server/.env

# 基础配置
PORT=8080
HOST=0.0.0.0
NODE_ENV=production
LOG_LEVEL=info

# 存储配置
STORAGE_ROOT=/data/registry-storage
# STORAGE_BACKEND=local

# R2 配置 (STORAGE_BACKEND=r2 时必填)
# R2_BUCKET_NAME=rack-registry
# R2_ACCOUNT_ID=your-account-id
# R2_ACCESS_KEY_ID=your-access-key-id
# R2_SECRET_ACCESS_KEY=your-secret-access-key

# 认证配置 (默认读仓库根 config/auth.json, 与 Worker 共用)
# AUTH_CONFIG_PATH=../../config/auth.json
# ADMIN_TOKEN=your-secret-admin-token

# Webhook 配置
WEBHOOK_CONFIG_PATH=config/webhooks.json
```

### 内置默认值 (不可通过环境变量配置)

以下值编译在服务器中, 无法通过环境变量更改:

| 设置               | 值         | 说明                                                |
| ------------------ | ---------- | --------------------------------------------------- |
| Cache-Control      | 按路由分层 | 详见[运维文档 - 响应缓存](./operations.md#响应缓存) |
| 压缩               | 始终启用   | 支持 `gzip`, `deflate`, `br` 编码                   |
| 速率限制最大请求数 | `1200` 次  | 每个时间窗口的最大请求数                            |
| 速率限制时间窗口   | `1 minute` | 速率限制的时间窗口                                  |
| 最大上传大小       | `100 MB`   | 最大文件上传大小                                    |

::: tip 速率限制
速率限制按**客户端 IP 独立计数**。在反向代理（如 Nginx / ALB / Cloudflare Tunnel）后部署时, 仅"透传 `X-Forwarded-For`" 不够 —— 还必须在服务端将 `TRUST_PROXY` 设为 `true` 或代理跳数 (如 `1`、`2`); 否则 Fastify 默认只看连接 IP, 所有真实客户端会被合并到代理 IP 的同一个 1200/min 配额。

超出限制时返回 `429 Too Many Requests`, 响应体为 Rack 统一错误格式:

```json
{
  "code": "RATE_LIMIT_EXCEEDED",
  "message": "Rate limit exceeded. Try again in 30s"
}
```

:::

## 认证配置

认证配置文件 (仓库根 `config/auth.json`, 与 [Cloudflare Worker](https://github.com/bytepixelio/Rack/blob/main/apps/registry-worker/README.md) 共用同一份) 是命名空间访问的唯一入口:

- 命名空间必须作为顶层键存在; 不在 `auth.json` 中的命名空间一律返回 403 Forbidden, 且不会出现在 `GET /namespaces` 列表中。
- 空数组 `[]` → 匿名读取 (上传仍被拒绝, 除非使用 Admin Token); 这类命名空间在发现接口中对所有人可见。
- 非数组值（如 `null`、字符串）或非空数组中所有条目均缺少有效 `token` 字段 → 该命名空间无法通过 per-namespace 校验, 不会出现在允许的命名空间集合中 (读取返回 403, 发现接口隐藏)。服务仍能启动, 错误会记入日志, 便于运维定位问题条目。
- 配置了 Token 的命名空间（非空数组）仅对携带有效 Token（或 Admin Token）的调用者可见。
- 数组内每个对象代表一个 Token, 字段如下:

| 字段        | 类型    | 必需 | 说明                          |
| ----------- | ------- | ---- | ----------------------------- |
| `token`     | string  | 是   | 认证 Token 字符串             |
| `publish`   | boolean | 否   | 是否允许发布 (默认 `false`)   |
| `mark`      | string  | 否   | Token 用途描述                |
| `expiresAt` | string  | 否   | ISO 8601 过期时间; 过期后 401 |

> 推荐用 `openssl rand -hex 32` 生成至少 32 字符的随机 Token, 并按命名空间维度区分只读 / 发布两类 Token。

### 完整配置示例

```json
{
  "@rack": [],
  "@public": [],

  "@company": [
    {
      "token": "a3f9c8e7b2d1f4e6a9c7b5d8f3e1a2c4",
      "mark": "团队只读访问"
    },
    {
      "token": "b6d9e7f1a3c5b8d2e4f7a9c1b3d5e8f2",
      "publish": true,
      "mark": "CI/CD 发布服务",
      "expiresAt": "2025-12-31T23:59:59Z"
    }
  ],

  "@private": [
    {
      "token": "c9e2f5a8b1d4c7e3f6a9b2c5d8e1f4a7",
      "publish": true,
      "mark": "内部发布系统"
    }
  ]
}
```

## Webhook 配置

Webhook 配置文件位于 `apps/registry-server/config/webhooks.json`, 用于配置事件通知。

### 配置文件结构

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

**字段说明**

| 字段          | 类型     | 必需 | 说明                 |
| ------------- | -------- | ---- | -------------------- |
| `url`         | string   | 是   | Webhook 端点 URL     |
| `secret`      | string   | 是   | HMAC-SHA256 签名密钥 |
| `events`      | string[] | 是   | 订阅的事件类型       |
| `enabled`     | boolean  | 是   | 是否启用             |
| `description` | string   | 否   | Webhook 描述         |

### 支持的事件类型

- `uploaded` - Registry 包上传成功后触发
- `version.created` - 新版本安装完成并更新 `versions.json` 后触发

::: tip 事件触发顺序
`uploaded` 和 `version.created` 事件在完整的上传流程（安装 + `versions.json` 更新）完成后依次触发。
:::

### 配置示例

#### 1. 单个 Webhook

```json
{
  "webhooks": [
    {
      "url": "https://ci.company.com/webhook",
      "secret": "webhook-secret-2024",
      "events": ["uploaded"],
      "enabled": true,
      "description": "触发 CI/CD 流水线"
    }
  ]
}
```

#### 2. 多个 Webhook

```json
{
  "webhooks": [
    {
      "url": "https://ci.company.com/webhook",
      "secret": "ci-webhook-secret",
      "events": ["uploaded"],
      "enabled": true,
      "description": "CI/CD 自动构建"
    },
    {
      "url": "https://notify.company.com/slack",
      "secret": "slack-webhook-secret",
      "events": ["uploaded", "version.created"],
      "enabled": true,
      "description": "Slack 通知 (订阅多个事件)"
    },
    {
      "url": "https://staging.company.com/webhook",
      "secret": "staging-secret",
      "events": ["uploaded"],
      "enabled": false,
      "description": "测试环境 (已禁用)"
    }
  ]
}
```

### Webhook 事件格式

当事件触发时, Registry Server 会向配置的 URL 发送 POST 请求:

**请求头**

```
Content-Type: application/json
User-Agent: Rack-Registry-Webhook/1.0
X-Webhook-Event: uploaded
X-Webhook-Signature: sha256=...
X-Webhook-Timestamp: 2025-11-07T10:30:00.000Z
X-Webhook-Delivery: unique-id
```

**请求体**

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

### 验证 Webhook 签名

在 Webhook 接收端验证签名 (Node.js 示例):

```javascript
const crypto = require('crypto')

function verifyWebhookSignature(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(payload)
  const expected = `sha256=${hmac.digest('hex')}`

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}

// 在 Express 中使用
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature']
  const payload = JSON.stringify(req.body)

  if (!verifyWebhookSignature(payload, signature, 'your-secret')) {
    return res.status(401).send('Invalid signature')
  }

  // 处理 Webhook 事件
  console.log('Event received:', req.body)
  res.status(200).send('OK')
})
```

::: tip Webhook 重试

- 失败的 Webhook 会自动重试最多 3 次（共 4 次尝试）
- 重试间隔: 2秒, 4秒, 8秒（指数退避）
- 每次投递有 **30 秒超时**，30 秒内无响应视为失败并进入重试
- 返回 2xx 状态码视为成功
- Webhook 队列为**纯内存队列**，进程重启后待重试任务将全部丢失。如需保证送达，请在接收端实现幂等处理逻辑
  :::
