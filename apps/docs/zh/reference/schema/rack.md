---
aside: false
---

# rack.json

`rack.json` 是项目配置文件, 定义项目的语言、模版、Registry 源等信息。

## 示例

```json
{
  "$schema": "https://registry.rackjs.com/schemas/rack.json",
  "name": "my-project",
  "language": "ts",
  "template": "react-tutorial-project",
  "items": [
    "runtimes/node@1.0.0",
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
  "$schema": "https://registry.rackjs.com/schemas/rack.json"
}
```

### `name`

- **类型**: `string`
- **必填**: 是
- **说明**: 项目名称

```json
{
  "name": "my-project"
}
```

### `language`

- **类型**: `string`（`"js"` | `"ts"`）
- **必填**: 否
- **说明**: 项目语言

**允许值**:

- `"ts"` - TypeScript
- `"js"` - JavaScript

```json
{
  "language": "ts"
}
```

### `template`

- **类型**: `string`
- **必填**: 否
- **说明**: 使用的模版名称

```json
{
  "template": "react-tutorial-project"
}
```

### `items`

- **类型**: `string[]`
- **必填**: 否
- **说明**: 已安装的 Registry 列表, 可以指定版本号

**格式**:

- 完整格式: `@namespace/name` 或 `@namespace/name@version`（用于非 `@rack` 命名空间）
- 简写格式: `name` 或 `name@version`（CLI 会自动解析为 `@rack/name`，推荐用于 `@rack` 注册表）

**版本号格式** (遵循 semver):

- 精确版本: `runtimes/node@1.0.0` 或 `@rack/runtimes/node@1.0.0`
- 不指定版本: `runtimes/node`（使用最新版本）

```json
{
  "items": [
    "runtimes/node@1.0.0",
    "build/vite",
    "frameworks/react"
  ]
}
```
