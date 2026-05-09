---
aside: false
---

# 发布 Registry

将自定义 Registry 发布到 Registry Server, 使其可以被 CLI 工具使用。

## 准备 Registry

在发布前, 确保你的 Registry 结构正确。

### Registry 目录结构

```
my-registry/
├── registry.json           # 必需: Registry 配置文件
├── templates/              # 可选: 模板文件
│   ├── src/
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
└── ...                     # 其他文件
```

### registry.json 示例

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

::: tip Schema 验证
使用 `$schema` 字段可以在编辑器中获得智能提示和验证。
:::

## 存储路径派生

Registry 上传后, 服务器将其存储到 `<namespace>/<segments>/<version>/` 路径下。`<segments>` 按以下顺序派生:

1. **显式 `path` 字段**（registry.json 顶层）—— 按 `/` 拆分。最后一段必须等于 `name`, 否则上传被拒（`UPLOAD_FAILED`）。详见 [`path` 字段说明](/zh/reference/schema/registry-item#path)。
2. **`type` 字段** —— 当 `path` 缺省时, 按下表映射:

   | `type`               | 存储段        |
   | -------------------- | ------------- |
   | `registry:runtime`   | `runtimes/`   |
   | `registry:framework` | `frameworks/` |
   | `registry:build`     | `build/`      |
   | `registry:feature`   | `features/`   |
   | `registry:testing`   | `testing/`    |
   | `registry:quality`   | `quality/`    |

3. **回退** —— `type` 不在表中 → 扁平布局 `<namespace>/<name>/`。

例: `name: "my-tool"`、`type: "registry:feature"`、命名空间 `@company` 的 Registry, 会存到 `@company/features/my-tool/<version>/`。该派生路径会出现在上传成功响应、规范读取 URL `GET /registries/<namespace>/<segments>/<version>` 以及 Webhook 推送 payload 中。

::: tip 何时显式设置 `path`
仅当存储位置需偏离 type 默认派生时设置 —— 例如把一个 `registry:feature` 归类到框架文件夹下（`"path": "frameworks/vue/router"`）。绝大多数 Registry 仅靠 `type` 即可。
:::

## 打包 Registry

将 Registry 打包成 tar.gz 格式。

### 使用 tar 命令

```bash
# 进入 Registry 目录本身（不是父目录），让 registry.json 落在
# 压缩包根，而不是 my-tool/ 子目录下。
cd /path/to/registries/my-tool

# 打包目录内容
# COPYFILE_DISABLE=1 阻止 macOS tar 注入 AppleDouble (._*) 元数据
# 文件 —— 服务端会拒收任何未在 registry.json 中声明的文件。
COPYFILE_DISABLE=1 tar -czf ../my-tool-1.0.0.tar.gz .

# 验证包内容
tar -tzf ../my-tool-1.0.0.tar.gz

# 预期输出 (registry.json 直接位于压缩包根)
# ./
# ./registry.json
# ./templates/src/config.ts
# ...
```

::: warning 包结构要求
- `registry.json` 必须位于压缩包根（`registry.json`，不是 `my-tool/registry.json`）
- 压缩包内只能出现在 `registry.json` 中声明的文件（`files[].path`、`languages.*.files[].path`、自定义 `mergeStrategy.script`），其余文件会被拒收
- 所有 `files[].path` 引用必须指向包内的普通文件 (不能是目录或符号链接)
- `files[].path` 必须是相对 POSIX 路径, 每段只允许 `A-Z a-z 0-9 . _ @ + -`; 不允许百分号编码、`?`、`#` 和反斜杠
- 推荐使用 `<name>-<version>.tar.gz` 命名格式
:::

## 计算 SHA256 校验和

上传时需要在 multipart 表单中携带 `checksum` 字段。Linux 上用 `sha256sum`, macOS 上用 `shasum -a 256`:

```bash
sha256sum my-tool-1.0.0.tar.gz | awk '{print $1}'
# 或 macOS:
shasum -a 256 my-tool-1.0.0.tar.gz | awk '{print $1}'
```

## 上传到服务器

使用 `POST /registries` API 上传 Registry 包。

### 使用 curl

```bash
# 设置变量
SERVER_URL="https://registry.company.com"
TOKEN="your-publish-token"
PACKAGE="my-tool-1.0.0.tar.gz"
CHECKSUM=$(sha256sum "$PACKAGE" | awk '{print $1}')

# 使用命名空间 Token 上传
curl -X POST "$SERVER_URL/registries" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$PACKAGE" \
  -F "checksum=$CHECKSUM"
```

### 使用 Admin Token

如果服务器配置了 `ADMIN_TOKEN`, 可以用它向任意命名空间发布, 无需配置命名空间级别的 Token:

```bash
curl -X POST "$SERVER_URL/registries" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -F "file=@$PACKAGE" \
  -F "checksum=$CHECKSUM"
```

::: tip Admin Token 与命名空间 Token
- **命名空间 Token**: 在 `auth.json` 中按命名空间配置, 需要 `publish: true` 权限
- **Admin Token**: 通过 `ADMIN_TOKEN` 环境变量设置, 上传时跳过命名空间级别的认证
  :::

::: tip 支持的 Content-Type

服务端会校验上传文件的 MIME 类型，以下值均被接受：

- `application/gzip`
- `application/x-gzip`
- `application/x-tar`
- `application/x-compressed`
- `application/octet-stream`

:::

### 成功响应

```json
{
  "message": "Registry uploaded successfully",
  "namespace": "@company",
  "name": "my-tool",
  "version": "1.0.0",
  "path": "@company/features/my-tool/1.0.0"
}
```

`path` 各段由 Registry 的 `type` 字段（或显式顶层 `path`）派生 —— 详见[存储路径派生](#存储路径派生)。

### 常见错误

#### 1. 缺少认证 Token

```json
{
  "code": "UNAUTHORIZED",
  "message": "Authentication token is required"
}
```

**解决方法**: 添加 Token

```bash
-H "Authorization: Bearer YOUR_TOKEN"
```

#### 2. Token 权限不足

```json
{
  "code": "INSUFFICIENT_PERMISSIONS",
  "message": "Token does not have publish permission for namespace @company"
}
```

**解决方法**: 在 `auth.json` 中为 Token 添加 `publish: true`, 或使用 Admin Token

#### 3. 匿名命名空间禁止上传

```json
{
  "code": "ANONYMOUS_UPLOAD_FORBIDDEN",
  "message": "Anonymous namespaces do not allow uploads. Use an admin token or configure namespace tokens."
}
```

**解决方法**: 在 `auth.json` 中为该命名空间配置 Token, 或使用 `ADMIN_TOKEN`

#### 4. 校验和不匹配

```json
{
  "code": "CHECKSUM_MISMATCH",
  "message": "Checksum verification failed",
  "expected": "abc123...",
  "actual": "def456..."
}
```

**解决方法**: 重新计算正确的校验和

#### 5. 版本已存在

```json
{
  "code": "VERSION_EXISTS",
  "message": "Registry @company/my-tool@1.0.0 already exists"
}
```

**解决方法**: 使用新的版本号

#### 6. 命名空间未允许

```json
{
  "code": "FORBIDDEN_NAMESPACE",
  "message": "Namespace not allowed"
}
```

**解决方法**: 在 `auth.json` 中添加该命名空间作为键

## CI/CD 集成

将发布流程集成到 CI/CD 管道中。

### GitHub Actions

创建 `.github/workflows/publish-registry.yml`:

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

配置 GitHub Secrets:
- `REGISTRY_TOKEN` - 发布 Token (命名空间 Token 或 Admin Token)
- `REGISTRY_URL` - Registry Server 地址

> 其它 CI 平台 (GitLab CI、CircleCI 等) 思路一致: 在 tag 触发的 job 中执行 `tar -czf ... && sha256sum ... && curl -X POST $REGISTRY_URL/registries`, 通过环境变量注入 `REGISTRY_TOKEN` 与 `REGISTRY_URL`。

## 版本管理

### 语义化版本

Registry 版本应遵循 [SemVer](https://semver.org/) 规范:

```
MAJOR.MINOR.PATCH

1.0.0 → 1.0.1 (补丁更新, 修复 bug)
1.0.1 → 1.1.0 (次版本更新, 新增功能)
1.1.0 → 2.0.0 (主版本更新, 破坏性变更)
```

### 版本列表

上传成功后, Registry Server 会自动更新 `versions.json`:

```json
{
  "versions": ["1.1.0", "1.0.1", "1.0.0"]
}
```

版本按降序排列, 最新版本在最前。

### 手动维护版本列表

`versions.json` 由上传流水线自动维护; 如果你直接在服务器文件系统上添加或删除版本目录, 需要手动同步对应的 `<storage>/<namespace>/<name>/versions.json` 文件 (按降序排列), 服务器会按其内容解析「最新版本」。建议优先通过 `POST /registries` 上传, 避免手工编辑。

## Webhook 通知

当 Registry 上传成功时, 会触发 Webhook 通知 (如果已配置)。

### Webhook 事件

```json
{
  "event": "uploaded",
  "timestamp": "2025-11-07T10:30:00.000Z",
  "namespace": "@company",
  "name": "my-tool",
  "version": "1.0.0",
  "path": "@company/features/my-tool/1.0.0"
}
```

### 使用场景

- **CI/CD 触发** - 自动构建和部署
- **通知** - 发送 Slack/钉钉消息
- **文档生成** - 自动生成和发布文档
- **测试** - 触发自动化测试

## 验证发布

发布后验证 Registry 是否可用:

```bash
# 查看版本列表（使用派生后的存储路径 —— `registry:feature` → `features/`）
curl https://registry.company.com/registries/@company/features/my-tool/versions

# 预期输出
# {"versions":["1.0.0"]}

# 获取最新版本 Registry 配置
curl https://registry.company.com/registries/@company/features/my-tool

# 获取特定版本
curl https://registry.company.com/registries/@company/features/my-tool/1.0.0
```

使用 CLI 测试:

```bash
# 配置命名空间
rk config set @company --url https://registry.company.com

# 添加 Registry
rk add @company/my-tool

# 查看已安装的 Registry
cat rack.json
```
