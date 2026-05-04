---
aside: false
---

# preset.json

`preset.json` 是预设配置文件, 定义一组预设的 Registry 组合, 用于快速初始化项目。

## 示例

```json
{
  "$schema": "https://registry.rackjs.com/schemas/preset.json",
  "name": "react-tutorial-project",
  "version": "1.0.0",
  "description": "React 教程项目预设, 包含 TypeScript、Vite、React Router 等",
  "author": "John Doe",
  "tags": ["react", "tutorial", "typescript"],
  "registries": [
    "runtimes/node",
    "build/vite",
    "frameworks/react"
  ]
}
```

## 字段说明

### `$schema`

- **类型**: `string`
- **必填**: 否
- **说明**: Schema URL

```json
{
  "$schema": "https://registry.rackjs.com/schemas/preset.json"
}
```

### `name`

- **类型**: `string`
- **必填**: 是
- **说明**: Preset 名称（kebab-case）

```json
{
  "name": "react-tutorial-project"
}
```

### `version`

- **类型**: `string`
- **必填**: 是
- **格式**: 语义化版本（semver）
- **说明**: Preset 版本

```json
{
  "version": "1.0.0"
}
```

### `description`

- **类型**: `string`
- **必填**: 否
- **说明**: Preset 描述

```json
{
  "description": "React 教程项目预设"
}
```

### `author`

- **类型**: `string`
- **必填**: 否
- **说明**: 作者信息

```json
{
  "author": "John Doe"
}
```

### `tags`

- **类型**: `string[]`
- **必填**: 否
- **说明**: 标签

```json
{
  "tags": ["react", "tutorial", "typescript"]
}
```

### `registries`

- **类型**: `string[]`
- **必填**: 是
- **说明**: Registry 列表, 可以指定版本号

**格式**:

- 完整格式: `@namespace/name` 或 `@namespace/name@version`（用于非 `@rack` 命名空间）
- 简写格式: `name` 或 `name@version`（CLI 会自动解析为 `@rack/name`，推荐用于 `@rack` 注册表）

**版本号格式** (遵循 semver):

- 精确版本: `runtimes/node@1.0.0` 或 `@rack/runtimes/node@1.0.0`
- 不指定版本: `runtimes/node`（使用最新版本）

```json
{
  "registries": [
    "runtimes/node",
    "build/vite",
    "frameworks/react",
    "@company/internal-tool@1.0.0"
  ]
}
```
