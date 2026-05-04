---
aside: false
---

# 部署概述

Registry Server 是 Rack 架构的核心组件之一, 负责托管和分发 Registry JSON 配置、Preset 模板和项目模板文件。

## 什么是 Registry Server?

Registry Server 是一个静态资源分发服务器, 为 Rack CLI 工具提供统一的资源访问接口。它支持:

- **Registry 分发** - 托管 Registry JSON 配置和模板文件
- **版本管理** - 支持多版本并存, 自动维护版本列表
- **包上传** - 支持通过 API 上传新的 Registry 包
- **命名空间管理** - 支持多租户隔离和访问控制
- **认证授权** - 基于 Token 的细粒度权限管理, 支持 Admin Token 进行跨命名空间操作
- **Webhook 集成** - 事件驱动的通知机制
- **性能优化** - 内置 ETag 缓存、压缩和速率限制

## 为什么需要自建服务?

虽然 Rack 提供了官方的 Registry 服务 (`https://registry.rackjs.com`), 但在以下场景下, 你可能需要部署自己的 Registry Server:

- **企业私有化部署** - 企业内部使用, 需要将服务部署在私有网络或内网环境中。
- **自定义 Registry 管理** - 需要托管企业内部开发的自定义 Registry 和模板。
- **访问控制和审计** - 需要对 Registry 访问进行精细化的权限控制和审计。
- **离线环境** - 在无法访问互联网的环境中使用 Rack。
- **自定义集成** - 需要与企业现有的 CI/CD 流程、DevOps 平台集成。

## 服务架构

Registry Server 采用简洁的架构设计:

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

**核心模块**

- **静态资源服务** - 分发 Registry、Preset、Schema 文件
- **上传服务** - 接收并处理 Registry 包上传
- **认证服务** - 基于 Token 的身份验证和权限控制
- **Webhook 服务** - 事件通知和集成
- **监控服务** - 健康检查和 Prometheus 指标

## 存储模式与部署拓扑

通过 `STORAGE_BACKEND` 可选两种部署形态, 读写路径差异较大, 选型前请确认:

### `STORAGE_BACKEND=local` (默认)

Server 同时承担上传与下载, 所有数据落在本地磁盘 (`STORAGE_ROOT`)。适合单机部署、内网环境、离线使用。

```text
┌───────────────┐            ┌─────────────────┐     ┌─────────────────────────┐
│               │            │                 │     │                         │
│ Rack CLI / CI ├GET─/─POST─►│ Registry Server ├────►│ Local disk STORAGE_ROOT │
│               │            │                 │     │                         │
└───────────────┘            └─────────────────┘     └─────────────────────────┘
```

### `STORAGE_BACKEND=r2` (Cloudflare R2 + Worker)

上传仍走 Server (保留 SHA256 校验、tar 解压、schema 校验、webhook 派发等业务逻辑), 但文件落在 Cloudflare R2。下载由专门的 [Cloudflare Worker](https://github.com/bytepixelio/Rack/blob/main/apps/registry-worker/README.md) 在边缘从 R2 直接分发, 对应域名是 `registry.rackjs.com` (自建可换成自己的域)。

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

::: warning r2 模式下 CLI / 客户端请把读取地址指向 Worker 域名
此模式下 Server **不再往本地盘写入**, 其 `GET /registries/**` 路由仍存在但本地目录为空, 直接打 Server 读会 404。客户端 (Rack CLI、浏览器、CI) 读取请用 Worker 域名; 只有 `POST /registries` 上传才打 Server。
:::

::: tip 两端共用一份 auth.json
Server 读仓库根 `config/auth.json` (校验上传权限), Worker 读 R2 中的 `.auth/auth.json` (校验下载权限)。仓库里的 [`sync-auth.yml`](https://github.com/bytepixelio/Rack/blob/main/.github/workflows/sync-auth.yml) 工作流会在 `config/auth.json` 变更后自动同步到 R2, 不需要人工在两边维护。
:::

## API 端点

| 方法     | 路径                               | 描述                 |
| -------- | ---------------------------------- | -------------------- |
| GET/HEAD | `/registries/@ns/name/versions`    | 版本列表             |
| GET/HEAD | `/registries/@ns/name`             | 最新版本             |
| GET/HEAD | `/registries/@ns/name/1.0.0`       | 指定版本             |
| GET/HEAD | `/registries/@ns/name/1.0.0/files/*` | 模板文件           |
| POST     | `/registries`                      | 上传 Registry 包     |
| GET      | `/namespaces`                      | 列出所有命名空间     |
| GET      | `/namespaces/:ns/registries`       | 列出命名空间下的 Registry |
| GET/HEAD | `/presets/:name`                   | 获取 Preset 模板     |
| GET/HEAD | `/schemas/:file`                   | 获取 JSON Schema     |
| GET      | `/health`                          | 健康检查             |
| GET      | `/metrics`                         | Prometheus 指标      |
