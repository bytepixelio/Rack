---
aside: false
---

# 命令行接口

## `rk init`

使用模板或单个 Registry 初始化一个新项目。

命令会询问项目名称、校验目标目录、运行安装管线、生成 `rack.json`, 并可选执行依赖安装与 `Git` 初始化。`-t/--template` 为必填参数。

### 用法

```bash
rk init -t <template> [-n <project-name>] [--ci] [-f] [--skip-install] [--skip-git]
```

### 选项

| 选项                        | 说明                                                                        |
| --------------------------- | --------------------------------------------------------------------------- |
| `-t, --template <template>` | **必填**。要使用的模板 ID, 例如 `@presets/tutorial-project` 或单个 Registry |
| `-n, --name <project-name>` | 预先指定项目名称 (省略时会进入交互式询问)                                   |
| `-f, --force`               | 强制覆盖已存在的目标目录                                                    |
| `--ci`                      | 在 `CI` 模式下运行 (非交互式; 同时跳过依赖安装与 Git 初始化)                |
| `--skip-install`            | 跳过依赖安装步骤                                                            |
| `--skip-git`                | 跳过 Git 仓库初始化                                                         |

## `rk add`

向现有项目应用指定 Registry。

### 用法

```bash
rk add <registry>
```

> 如果当前目录没有 `rack.json`, `rk add` 会根据目录名称自动生成一份最小配置后再继续安装。Preset 标识符 (以 `@presets/` 开头) 不允许通过 `rk add` 安装, 请使用 `rk init -t`。已安装过的 Registry 会被跳过 (幂等)。

### 示例

```bash
rk add runtimes/node

# 输出 (示例):
# ✓ Added registry runtimes/node
# • Files: src/index.ts
# • Dependencies: typescript@^5.5.0
```

## `rk list`

发现 Registry 服务器上可用的命名空间与 Registry。适合作为使用 `rk add` 之前的探索入口——尤其是 AI 工具在不知道有哪些模块可装时, 可以通过它枚举服务器上的资源。

### 用法

```bash
rk list [namespace] [--json] [--registry <namespace>]
```

### 参数与选项

| 参数 / 选项              | 说明                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `[namespace]`            | 指定要列出的命名空间 (如 `@rack`)。省略时列出服务器上的所有命名空间。                     |
| `--json`                 | 以 JSON 格式输出到 stdout, 推荐 AI 或脚本调用使用。                                       |
| `--registry <namespace>` | 指定要查询的 Registry 命名空间 (默认 `@rack`); 多个 Registry 服务器时用来选择目标服务器。 |

### 示例

```bash
# 列出默认 Registry 上的所有命名空间
rk list

# 列出指定命名空间下的所有 Registry
rk list @rack

# 机器可读输出
rk list @rack --json
```

### 典型发现流程

```bash
rk list --json                 # 1. 发现命名空间
rk list @rack --json           # 2. 发现该命名空间下的 Registry
rk add @rack/<name>            # 3. 安装
```

内部会调用 Registry 服务器的 `GET /namespaces` 与 `GET /namespaces/:namespace/registries` 端点。通过 `rk config set` 配置的凭证与自定义请求头会自动带上。

## `rk config`

管理本地 Registry 源配置 (默认位于 `~/.rackrc`)。

### 用法

```bash
rk config <subcommand>
```

### 子命令

| 子命令                  | 别名 | 说明                                                  | 示例                                  |
| ----------------------- | ---- | ----------------------------------------------------- | ------------------------------------- |
| `rk config list`        | `ls` | 显示所有已配置的 Registry 源                          | `rk config list`                      |
| `rk config get <ns>`    | -    | 查看指定命名空间的 Registry 详情                      | `rk config get @rack`                 |
| `rk config set <ns>`    | -    | 新增或更新 Registry 源配置                            | `rk config set @internal --url <url>` |
| `rk config remove <ns>` | `rm` | 移除 Registry 源配置 (需确认, 除非使用 `-f` 强制删除) | `rk config remove @internal`          |

#### `list` 子命令选项

| 选项     | 说明                                    |
| -------- | --------------------------------------- |
| `--json` | 以 JSON 格式输出所有配置 (便于脚本处理) |

#### `get` 子命令选项

| 选项     | 说明                                |
| -------- | ----------------------------------- |
| `--json` | 以 JSON 格式输出配置 (便于脚本处理) |

#### `set` 子命令选项

| 选项                   | 说明                                               |
| ---------------------- | -------------------------------------------------- |
| `--url <url>`          | Registry 服务器地址                                |
| `--token <token>`      | 认证令牌 (自动添加 `Authorization: Bearer` 请求头) |
| `--header <header...>` | 自定义请求头, 格式为 `Key: Value`, 可多次使用      |

设置配置后, 命令会自动以格式化方式展示新的配置信息, 包括 URL 和 Headers。`--token` 在存盘时单独保存为 `token` 字段; 在显示与发起请求时统一展开为 `Authorization: Bearer <token>` 请求头。

#### `remove` 子命令选项

| 选项          | 说明             |
| ------------- | ---------------- |
| `-f, --force` | 跳过删除确认提示 |

#### 安全注意事项

- **命名空间格式**: 必须以 `@` 开头; CLI 不会自动删除默认的 `@rack` 命名空间
- **凭证以明文展示**: `rk config get/list` 当前不会对 Token 或敏感请求头做掩码处理, 请妥善保护本机的 `~/.rackrc` 与终端输出

### 示例

```bash
# 配置私有 Registry
rk config set @internal --url https://registry.company.com --token abc123xyz789
# 输出:
# ✓ Registry @internal configured successfully
#
# Configuration for @internal:
#   URL:      https://registry.company.com
#   Headers:
#     Authorization -> Bearer abc123xyz789

# 添加自定义请求头
rk config set @internal --url https://registry.company.com \
  --header "X-API-Version: v2" \
  --header "X-Environment: production"
# 输出:
# ✓ Registry @internal configured successfully
#
# Configuration for @internal:
#   URL:      https://registry.company.com
#   Headers:
#     X-API-Version -> v2
#     X-Environment -> production

# 查看配置 (Token 会以 Authorization Bearer 形式展开)
rk config get @internal
# 输出:
# Configuration for @internal:
#   URL:      https://registry.company.com
#   Headers:
#     Authorization -> Bearer abc123xyz789
#     X-API-Version -> v2
#     X-Environment -> production

# JSON 格式输出
rk config get @internal --json

# 列出所有配置
rk config list
# 输出:
# Configuration for @rack:
#   URL:      https://registry.rackjs.com
# Configuration for @internal:
#   URL:      https://registry.company.com
#   Headers:
#     Authorization -> Bearer abc123xyz789
#     X-API-Version -> v2
#     X-Environment -> production

# 以 JSON 格式列出所有配置
rk config list --json

# 删除配置 (需确认)
rk config remove @internal
# 输出 (如果确认):
# ✓ Registry @internal removed successfully
# 输出 (如果取消):
# Operation cancelled

# 强制删除 (跳过确认)
rk config remove @internal -f
# 输出:
# ✓ Registry @internal removed successfully
```

## `rk doctor`

环境诊断。

### 用法

```bash
rk doctor [options]
```

### 选项

| 选项     | 说明                                           |
| -------- | ---------------------------------------------- |
| `--json` | 以结构化 JSON 输出诊断结果, 便于在 `CI` 中处理 |

### 说明

- 并行执行三类检查:
  - **environment**: Node.js 版本不低于 `engines.node`、`git` 是否在 `PATH`
  - **project**: `rack.json` 是否合法以及已安装的 Registry 数量
  - **remote**: 对 `~/.rackrc` 中每一个命名空间发起 `/health` 探针
- 检查级别为 `info` / `warning` / `error`; 任意 `error` 都会导致非零退出状态码。
- 默认输出文本版分组摘要; 加 `--json` 后输出结构化结果, 适合在 CI 中消费。

## `rk version`

显示当前 `CLI` 版本信息。

### 用法

```bash
rk version
```

### 输出

- Rack CLI 版本号
- Node.js 运行时版本与平台 (如 `darwin/arm64`)
- `~/.rackrc` 的实际路径

```bash
rk version
# Version: 1.0.0
# Node.js: v22.10.0
# Platform: darwin/arm64
# Config: /Users/me/.rackrc
```
