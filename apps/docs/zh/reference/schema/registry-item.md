---
aside: false
---

# registry-item.json

`registry.json` 是单个 Registry 的配置文件。`registry-item.json` 是用于校验 `registry.json` 内容的 schema, 覆盖依赖、文件、脚本等字段定义。

## 示例

```json
{
  "$schema": "https://registry.rackjs.com/schemas/registry-item.json",
  "name": "react",
  "namespace": "@rack",
  "type": "registry:framework",
  "version": "1.0.0",
  "description": "React + TypeScript 框架配置",
  "tags": ["react", "typescript", "framework"],
  "priority": 2,
  "conflicts": ["frameworks/vue"],
  "registryDependencies": ["runtimes/node"],
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^5.0.0"
  },
  "files": [
    {
      "target": "index.html",
      "type": "registry:entry",
      "path": "./templates/react/index.html"
    },
    {
      "target": ".gitignore",
      "type": "registry:config",
      "content": "node_modules\ndist\n.env.local"
    }
  ],
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "languages": {
    "js": {
      "files": [
        {
          "target": "src/index.jsx",
          "type": "registry:entry",
          "path": "./templates/react-js/src/index.jsx"
        },
        {
          "target": "src/App.jsx",
          "type": "registry:entry",
          "path": "./templates/react-js/src/App.jsx"
        }
      ]
    },
    "ts": {
      "devDependencies": {
        "typescript": "^5.3.0"
      },
      "files": [
        {
          "target": "src/index.tsx",
          "type": "registry:entry",
          "path": "./templates/react/src/index.tsx"
        },
        {
          "target": "src/App.tsx",
          "type": "registry:entry",
          "path": "./templates/react/src/App.tsx"
        },
        {
          "target": "tsconfig.json",
          "type": "registry:config",
          "content": "{\n  \"compilerOptions\": {\n    \"target\": \"ES2020\",\n    \"jsx\": \"react-jsx\"\n  }\n}"
        }
      ]
    }
  },
  "defaultLanguage": "ts"
}
```

## 字段说明

### `$schema`

- **类型**: `string`
- **必填**: 否
- **说明**: Schema URL, 用于编辑器验证和自动补全

```json
{
  "$schema": "https://registry.rackjs.com/schemas/registry-item.json"
}
```

### `name`

- **类型**: `string`
- **必填**: 是
- **格式**: kebab-case
- **说明**: Registry 在所属命名空间下的唯一标识符

```json
{
  "name": "react"
}
```

### `namespace`

- **类型**: `string`
- **必填**: 是
- **格式**: `@` 开头后接 kebab-case 片段（如 `@rack`、`@company`）
- **说明**: Registry 所属的命名空间。与 `name` 共同构成全局唯一标识符 `@namespace/name`, 在 `rk add` 命令和依赖引用中使用。

```json
{
  "namespace": "@rack"
}
```

### `type`

- **类型**: `string`
- **必填**: 是
- **说明**: Registry 类型, 决定其在技术栈中的角色

```json
{
  "type": "registry:framework"
}
```

**可选值**:

| 类型                 | 说明     | 推荐优先级 |
| -------------------- | -------- | ---------- |
| `registry:runtime`   | 运行环境 | 1          |
| `registry:framework` | 应用框架 | 2          |
| `registry:build`     | 构建工具 | 3          |
| `registry:feature`   | 功能特性 | 4          |
| `registry:testing`   | 测试工具 | 5          |
| `registry:quality`   | 质量工具 | 6          |

### `path`

- **类型**: `string`
- **必填**: 否
- **格式**: 小写 kebab 段以 `/` 连接（如 `quality/husky`）
- **说明**: 可选的存储段路径, 覆盖由 `type` 派生的默认存储位置。最后一段**必须等于 `name`**, 否则上传被拒（`UPLOAD_FAILED`）。仅在 Registry 的语义角色与存储位置不一致时使用（少见场景）。未设置时, 服务器按 `type` 派生段路径 —— 详见 [存储路径派生](/zh/guide/registry-server/publishing#存储路径派生)。

```json
{
  "namespace": "@rack",
  "name": "husky",
  "path": "quality/husky"
}
```

::: warning 与 `files[].path` 的区别
顶层 `path` 决定 **Registry 本身**的存储位置; `files[]` 数组项里的 `path` 指向**模板源文件**（如 `./templates/.gitignore`）。键名相同, 概念完全不同。
:::

### `version`

- **类型**: `string`
- **必填**: 是
- **格式**: 语义化版本（semver）
- **说明**: Registry 版本号

```json
{
  "version": "1.0.0"
}
```

### `description`

- **类型**: `string`
- **必填**: 否
- **说明**: Registry 的功能描述

```json
{
  "description": "React + TypeScript 框架配置"
}
```

### `tags`

- **类型**: `string[]`
- **必填**: 否
- **说明**: 标签数组, 用于分类和搜索

```json
{
  "tags": ["react", "typescript", "framework"]
}
```

### `priority`

- **类型**: `integer`（≥ 0）
- **必填**: 是
- **推荐范围**: 1-6（用户可自定义任何非负整数）
- **说明**: 优先级, 决定安装顺序和版本冲突解决。数字越小越先安装, 优先级越高

```json
{
  "priority": 2
}
```

### `author`

- **类型**: `string`
- **必填**: 否
- **说明**: 作者姓名及可选的联系方式

```json
{
  "author": "Jane Doe <jane@example.com>"
}
```

### `license`

- **类型**: `string`
- **必填**: 否
- **说明**: SPDX 协议标识（如 `MIT`、`Apache-2.0`）

```json
{
  "license": "MIT"
}
```

### `homepage`

- **类型**: `string`
- **必填**: 否
- **格式**: URI
- **说明**: 项目主页 URL

```json
{
  "homepage": "https://example.com/my-registry"
}
```

### `repository`

- **类型**: `string`
- **必填**: 否
- **说明**: 仓库 URL 或简写（如 `github:owner/repo`）

```json
{
  "repository": "https://github.com/example/my-registry"
}
```

### `conflicts`

- **类型**: `string[]`
- **必填**: 否
- **说明**: 冲突的 Registry, 不能同时安装

```json
{
  "conflicts": ["frameworks/vue"]
}
```

### `registryDependencies`

- **类型**: `string[]`
- **必填**: 否
- **说明**: 自动安装的其他 Registry。不支持版本锁定 (`@version` 后缀), 依赖始终解析为最新版本。

```json
{
  "registryDependencies": ["runtimes/node"]
}
```

### `dependencies`

- **类型**: `Record<string, string>`
- **必填**: 否
- **说明**: 生产环境依赖

```json
{
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  }
}
```

### `devDependencies`

- **类型**: `Record<string, string>`
- **必填**: 否
- **说明**: 开发环境依赖

```json
{
  "devDependencies": {
    "@vitejs/plugin-react": "^5.0.0",
    "typescript": "^5.3.0"
  }
}
```

### `files`

- **类型**: `FileObject[]`
- **必填**: 否
- **说明**: 通用文件列表

```json
{
  "files": [
    {
      "target": "index.html",
      "type": "registry:entry",
      "path": "./templates/react/index.html"
    },
    {
      "target": ".gitignore",
      "type": "registry:config",
      "content": "node_modules\ndist\n.env.local"
    }
  ]
}
```

**`FileObject` 结构**

| 字段          | 类型    | 必填 | 说明                            |
| ------------- | ------- | ---- | ------------------------------- |
| target        | string  | 是   | 目标文件路径                    |
| type          | string  | 是   | `FileObject` 类型               |
| content       | string  | 否   | 内联文件内容。非 asset 文件同时有 content 和 path 时优先使用 content |
| path          | string  | 否   | 服务端模板文件路径。`registry:asset` 同时有 path 和 content 时优先使用 path |
| executable    | boolean | 否   | 是否需要可执行权限              |
| mergeStrategy | object  | 否   | 合并策略配置                    |

**`path` 格式要求**: 相对 POSIX 路径, 可选 `./` 前缀。每个路径段只允许 `A-Z a-z 0-9 . _ @ + -`。**不允许**使用: 百分号编码 (`%`)、查询符 (`?`)、片段符 (`#`)、反斜杠 (`\`)、绝对路径、空段, 以及 `.`/`..` 段。引用的文件必须存在于上传的包中, 且必须是普通文件 (不能是目录或符号链接)。

`registry:asset` 类型建议使用 `path`。当使用 `path` 时, CLI 按二进制方式写入目标文件, 并采用覆盖行为。

**`mergeStrategy` 配置**

| 字段     | 类型   | 必填                         | 说明                                    |
| -------- | ------ | ---------------------------- | --------------------------------------- |
| type     | string | 是                           | 策略类型：`builtin` 或 `custom`          |
| strategy | string | `type` 为 `"builtin"` 时必填 | 内置策略名称：`json`、`ignore`、`env`、`overwrite`。`type` 为 `"custom"` 时不允许出现 |
| script   | string | `type` 为 `"custom"` 时必填  | 插件脚本路径。`type` 为 `"builtin"` 时不允许出现 |

**示例**：

使用内置策略：

```json
{
  "files": [
    {
      "target": "myconfig.json",
      "type": "registry:config",
      "path": "./templates/myconfig.json",
      "mergeStrategy": {
        "type": "builtin",
        "strategy": "json"
      }
    }
  ]
}
```

使用自定义插件：

```json
{
  "files": [
    {
      "target": "myconfig.json",
      "type": "registry:config",
      "path": "./templates/myconfig.json",
      "mergeStrategy": {
        "type": "custom",
        "script": "./scripts/merge-myconfig.js"
      }
    }
  ]
}
```

**`FileObject` 类型**

- `registry:entry` - 入口文件
- `registry:config` - 配置文件
- `registry:lib` - 库文件
- `registry:test` - 测试文件
- `registry:docs` - 文档文件
- `registry:script` - 脚本文件（推荐设置 `executable: true`）
- `registry:asset` - 静态资源文件

**使用建议**

- 简单配置用 `content` (如 `.gitignore`、小型 `JSON` 配置)
- 复杂代码用 `path` (如 `React` 组件、复杂配置文件)

### `scripts`

- **类型**: `Record<string, string>`
- **必填**: 否
- **说明**: 添加到 `package.json` 的 `npm` 脚本

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

### `languages`

- **类型**: `object`（key 只允许 `"js"` 或 `"ts"`）
- **必填**: 否
- **说明**: 语言特定配置。当前仅支持 JavaScript (`js`) 和 TypeScript (`ts`) 两种语言变体

```json
{
  "languages": {
    "js": {
      "files": [
        {
          "target": "src/index.jsx",
          "type": "registry:entry",
          "path": "./templates/react/js/src/index.jsx"
        }
      ]
    },
    "ts": {
      "devDependencies": {
        "typescript": "^5.3.0"
      },
      "files": [
        {
          "target": "src/index.tsx",
          "type": "registry:entry",
          "path": "./templates/react/ts/src/index.tsx"
        },
        {
          "target": "tsconfig.json",
          "type": "registry:config",
          "content": "{...}"
        }
      ]
    }
  }
}
```

**可包含字段** (Schema 仅允许以下三项, 其它字段会被拒绝)

- `dependencies` - 语言特定的生产依赖
- `devDependencies` - 语言特定的开发依赖
- `files` - 语言特定的文件

> `scripts`、`registryDependencies` 等字段必须放在 Registry 顶层 (通用) 配置中, 不能放进 `languages.X`。

**设计原则**

- `files` 字段存放通用文件
- `languages.js/ts.files` 存放语言特定的文件

### `defaultLanguage`

- **类型**: `string`（只允许 `"js"` 或 `"ts"`）
- **必填**: 否 (有 `languages` 时推荐)
- **说明**: 默认语言, 决定没有显式指定语言时使用的变体。CLI 在解析时优先级为: 命令行 `:language` 后缀 > `rack.json` 中的 `language` > `defaultLanguage` > `"ts"`

```json
{
  "defaultLanguage": "ts"
}
```
