---
aside: false
---

# 自定义 Registry

本章节介绍如何创建和使用自定义 Registry。

## 为什么要创建 Registry？

在以下场景中, 可能需要创建自定义 Registry。

- **企业内部规范** - 封装团队统一的技术栈配置
- **定制化需求** - 根据特定项目需求定制专用配置
- **复用配置** - 将常用的工具配置打包为可复用模块
- **新技术支持** - 为官方 Registry 尚未支持的技术栈创建配置

## 基本步骤

创建一个 Registry 需要完成以下步骤。

## 1. 创建目录结构

在本地项目中创建 Registry 目录。

```bash
my-registries/
└── ui-kit/
    ├── registry.json        # Registry 配置文件
    └── templates/           # 模板文件目录
        ├── components/
        │   └── Button.tsx
        └── styles/
            └── index.css
```

**目录说明**

- `registry.json` - Registry 的核心配置文件
- `templates/` - 存放模板文件的目录, 可根据需要自由组织子目录

## 2. 编写 registry.json

创建 `ui-kit/registry.json` 文件, 定义 Registry 的基本信息。

```json
{
  "$schema": "https://registry.rackjs.com/schemas/registry-item.json",
  "name": "ui-kit",
  "namespace": "@your-org",
  "type": "registry:feature",
  "version": "1.0.0",
  "description": "企业 UI 组件库",
  "priority": 4,
  "tags": ["ui", "components", "design-system"],
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0"
  },
  "files": [
    {
      "target": "src/components/Button.tsx",
      "type": "registry:lib",
      "path": "./templates/components/Button.tsx"
    },
    {
      "target": "src/styles/ui-kit.css",
      "type": "registry:lib",
      "path": "./templates/styles/index.css"
    }
  ]
}
```

**关键字段说明**

- `name` - Registry 的唯一标识符, 使用 kebab-case 命名
- `type` - Registry 类型, 决定其在技术栈中的角色
- `version` - 版本号, 遵循语义化版本规范
- `priority` - 优先级, 决定安装顺序和覆盖规则
- `files` - 需要创建或合并的文件列表

完整的字段说明请参考 [registry-item.json](/zh/reference/schema/registry-item)。

## 3. 选择 Registry 类型

根据功能从 [Registry 类型](/zh/guide/registry#registry-类型) 中挑选合适的 `type` 与 `priority`。

## 4. 创建模板文件

模板文件有两种方式定义, 分别是**外部文件**和**内联内容**。

#### 使用外部文件 (推荐)

创建模板文件 `ui-kit/templates/components/Button.tsx`。

```typescript
import React from 'react'

export interface ButtonProps {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary'
}

export function Button({ children, onClick, variant = 'primary' }: ButtonProps) {
  return (
    <button className={`btn btn-${variant}`} onClick={onClick}>
      {children}
    </button>
  )
}
```

在 `registry.json` 中使用 `path` 引用。

```json
{
  "files": [
    {
      "target": "src/components/Button.tsx",
      "type": "registry:lib",
      "path": "./templates/components/Button.tsx"
    }
  ]
}
```

#### 方式二: 使用内联内容

对于简单的配置文件, 可以直接在 `registry.json` 中使用 `content` 字段。

```json
{
  "files": [
    {
      "target": ".gitignore",
      "type": "registry:config",
      "content": "node_modules\ndist\n*.log"
    }
  ]
}
```

## 5. 选择文件类型

为每个文件选择合适的 `type`。

| 文件类型          | 说明                           | 示例                          |
| ----------------- | ------------------------------ | ----------------------------- |
| `registry:entry`  | 应用入口文件                   | `main.ts`, `index.ts`         |
| `registry:config` | 配置文件                       | `tsconfig.json`, `.gitignore` |
| `registry:lib`    | 库文件和工具函数               | `utils.ts`, `helpers.ts`      |
| `registry:test`   | 测试文件                       | `*.test.ts`, `*.spec.ts`      |
| `registry:docs`   | 文档文件                       | `README.md`, `CHANGELOG.md`   |
| `registry:script` | 可执行脚本 (需设置 executable) | `setup.sh`, `build.sh`        |
| `registry:asset`  | 静态资源文件                   | 图片、字体等                  |

`registry:asset` 建议使用 `path` 引用外部文件。CLI 会按二进制方式写入并使用覆盖策略，不参与文本合并。

## 6. 添加依赖关系

#### 声明 Registry 依赖

如果 Registry 需要其他 Registry 才能正常工作, 使用 `registryDependencies` 字段。

```json
{
  "name": "vue-router",
  "type": "registry:feature",
  "registryDependencies": ["frameworks/vue"]
}
```

执行 `rk add features/vue-router` 时会自动安装 `frameworks/vue`。

#### 声明冲突

如果 Registry 与其他 Registry 不兼容, 使用 `conflicts` 字段。

```json
{
  "name": "my-framework",
  "type": "registry:framework",
  "conflicts": ["frameworks/react", "frameworks/vue"]
}
```

当项目中已有冲突的 Registry 时, 安装会被阻止。

## 7. 支持语言变体

如果需要同时支持 `JavaScript` 和 `TypeScript`, 使用 `languages` 字段。每个语言块只能包含 `dependencies`、`devDependencies`、`files` 三个字段。

```json
{
  "name": "my-registry",
  "type": "registry:feature",
  "version": "1.0.0",
  "description": "支持 JS 和 TS 的 Registry",
  "priority": 4,
  "files": [
    {
      "target": "package.json",
      "type": "registry:config",
      "path": "./templates/package.json"
    }
  ],
  "languages": {
    "js": {
      "files": [
        {
          "target": "src/index.js",
          "type": "registry:entry",
          "path": "./templates/js/src/index.js"
        }
      ]
    },
    "ts": {
      "devDependencies": {
        "typescript": "^5.9.2"
      },
      "files": [
        {
          "target": "src/index.ts",
          "type": "registry:entry",
          "path": "./templates/ts/src/index.ts"
        },
        {
          "target": "tsconfig.json",
          "type": "registry:config",
          "path": "./templates/ts/tsconfig.json"
        }
      ]
    }
  },
  "defaultLanguage": "ts"
}
```

详细说明请参考 [语言变体](/zh/guide/language-variants)。

## 8. 部署 Registry

创建完成后, 需要将 Registry 部署到可通过 HTTP 访问的服务器上。CLI 会按 `{host}/registries/{@namespace}/{path}[/{version}]` 拉取, 部署目录必须以 `/registries/@<命名空间>/` 开头。

#### 部署方式

**推荐: `@rack/registry-server`**

直接用 [Registry Server](/zh/guide/registry-server/overview) —— 它内置了 `/registries/...` / `/presets/...` / `/schemas/...` 路由, 处理上传、版本管理和认证, 不用自己拼目录。

**自建静态文件服务器**

把 Registry 文件按 CLI 期望的 URL 路径平铺。Server 需要把请求 `/registries/@company/ui-kit` 映射到 `registry.json` 文件 (大多数静态服务器需要 rewrite 规则或目录 index 配置)。

```bash
# 静态服务器根目录布局
https://registry.company.com/
└── registries/
    └── @company/
        └── ui-kit/
            ├── registry.json    # 对应 URL: /registries/@company/ui-kit
            └── templates/
                └── ...
```

**CLI 实际访问的 URL**

```
https://registry.company.com/registries/@company/ui-kit
```

> URL 末尾不带 `/registry.json` —— Server 需要在该路径上返回 `registry.json` 的 JSON 内容。详见 [命名空间 → Registry URL 结构](/zh/guide/namespace#registry-url-结构)。

## 9. 配置和使用

部署完成后, 配置命名空间并使用 Registry。

#### 配置私有源

```bash
rk config set @company --url https://registry.company.com
```

如果需要认证。

```bash
rk config set @company --url https://registry.company.com --token your-token-here
```

详细说明请参考 [认证](/zh/guide/authentication)。

#### 使用 Registry

```bash
# 添加 Registry
rk add @company/ui-kit

# 指定语言变体
rk add @company/ui-kit:ts
```

#### 验证安装

检查项目中是否正确生成了文件和配置。

```bash
# 检查生成的文件
ls src/components/Button.tsx
ls src/styles/ui-kit.css

# 检查依赖是否安装
cat package.json
```
