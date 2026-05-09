---
aside: false
---

# 语言变体

Rack 支持语言变体, 即同一个 Registry 根据项目使用的语言 (`JavaScript` 或 `TypeScript`) 提供不同的配置和文件。

## 为什么需要语言变体？

同一个技术栈在 `JavaScript` 和 `TypeScript` 项目中往往需要不同的配置。

- **文件扩展名**: `.js` vs `.ts`, `.jsx` vs `.tsx`
- **依赖包**: `TypeScript` 项目需要额外的 `typescript`、类型定义包
- **配置文件**: `TypeScript` 项目需要 `tsconfig.json`
- **构建工具**: 可能需要不同的编译器选项

语言变体可以让一个 Registry 同时支持两种语言。

## 语言变体结构

在 Registry 中使用 `languages` 字段定义语言特定配置。

```json
{
  "name": "vue",
  "type": "registry:framework",
  "priority": 2,

  // 通用配置（JS 和 TS 都需要）
  "dependencies": {
    "vue": "^3.4.0"
  },
  "files": [
    {
      "target": "index.html",
      "type": "registry:entry",
      "path": "./templates/index.html"
    }
  ],

  // 语言特定配置
  "languages": {
    "js": {
      "files": [
        {
          "target": "src/main.js",
          "type": "registry:entry",
          "path": "./templates/js/main.js"
        }
      ]
    },
    "ts": {
      "devDependencies": {
        "typescript": "^5.9.2",
        "vue-tsc": "^2.0.0"
      },
      "files": [
        {
          "target": "src/main.ts",
          "type": "registry:entry",
          "path": "./templates/ts/main.ts"
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

## 配置项

#### 通用配置

在 `languages` 外部的字段对所有语言都生效。

```json
{
  "dependencies": {
    "vue": "^3.4.0" // JS 和 TS 都需要
  },
  "files": [
    {
      "target": "index.html", // JS 和 TS 共用同一个 HTML
      "type": "registry:entry",
      "path": "./templates/index.html"
    }
  ]
}
```

#### 特定配置

`languages.js` 和 `languages.ts` 中的配置仅在对应语言下生效。每个语言块只能包含 `dependencies`、`devDependencies`、`files` 三个字段 (Schema 校验; 详见 [registry-item.json](/zh/reference/schema/registry-item))。

```json
{
  "languages": {
    "js": {
      "files": [...],           // 仅 JS 项目
      "dependencies": {...},    // 仅 JS 项目
      "devDependencies": {...}  // 仅 JS 项目
    },
    "ts": {
      "files": [...],           // 仅 TS 项目
      "devDependencies": {...}  // 仅 TS 项目
    }
  }
}
```

> 如果某个 `script` 只与特定语言相关, 请将它放在 Registry 的顶层 (通用) 配置中, 或拆分为独立 Registry。语言块仅接受 `dependencies`、`devDependencies` 和 `files`。

#### `defaultLanguage`

指定默认使用的语言。

```json
{
  "defaultLanguage": "ts"
}
```

当用户没有明确指定语言时，使用默认语言。

## 使用语言变体

#### 使用项目配置的语言

在 `rack.json` 中设置项目语言。

```json
{
  "name": "my-project",
  "language": "ts"
}
```

然后添加 Registry。

```bash
rk add frameworks/vue
```

Rack 会自动使用 `languages.ts` 的配置。

#### 显式指定语言

使用 `:language` 后缀强制指定。

```bash
# 使用 TypeScript 变体
rk add frameworks/vue:ts

# 使用 JavaScript 变体
rk add frameworks/vue:js
```

**完整格式示例**（包含命名空间）：

```bash
# 完整格式: @namespace/path/to/registry:language
rk add @rack/runtimes/node:ts          # 官方 Node.js TypeScript 变体
rk add @rack/runtimes/node:js          # 官方 Node.js JavaScript 变体
rk add @rack/frameworks/vue:ts         # 官方 Vue.js TypeScript 变体
rk add @company/internal-tools:js      # 私有 Registry JavaScript 变体

# 简写格式（省略 @rack 命名空间）
rk add runtimes/node:ts
rk add runtimes/node:js
rk add frameworks/vue:ts
rk add frameworks/vue:js
```

这会覆盖 `rack.json` 中的语言设置。

#### 使用默认语言

如果 `rack.json` 没有 `language` 字段, 且命令中也没有指定, 则使用 Registry 的 `defaultLanguage`。

```bash
# rack.json 中没有 language 字段
rk add frameworks/vue  # 使用 defaultLanguage: "ts"
```

## 合并规则

#### 文件合并

通用 `files` + 语言特定 `files` = 最终文件列表。

```json
{
  "files": [
    { "target": "index.html", ... }  // 通用
  ],
  "languages": {
    "ts": {
      "files": [
        { "target": "src/main.ts", ... },  // TS 特定
        { "target": "tsconfig.json", ... }
      ]
    }
  }
}
```

**TS 项目最终文件**

- `index.html` (通用)
- `src/main.ts` (TS 特定)
- `tsconfig.json` (TS 特定)

#### 依赖合并

通用依赖 + 语言特定依赖 = 最终依赖。

```json
{
  "dependencies": {
    "vue": "^3.4.0" // 通用
  },
  "devDependencies": {
    "vite": "^5.0.0" // 通用
  },
  "languages": {
    "ts": {
      "devDependencies": {
        "typescript": "^5.9.2", // TS 特定
        "vue-tsc": "^2.0.0"
      }
    }
  }
}
```

**TS 项目最终依赖**

```json
{
  "dependencies": {
    "vue": "^3.4.0"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "typescript": "^5.9.2",
    "vue-tsc": "^2.0.0"
  }
}
```

#### Scripts 合并

`scripts` 字段属于 Registry 的通用配置, 不能放进 `languages.js` / `languages.ts` 中 (会被 Schema 拒绝)。如果两种语言需要不同的脚本, 通常通过在通用 `scripts` 里写一份适用于默认语言的命令, 再让后续 Registry (如构建工具) 覆盖。

```json
{
  "scripts": {
    "dev": "vite",
    "preview": "vite preview"
  }
}
```

> 如需为某种语言提供完全不同的脚本, 推荐拆分为独立 Registry (例如 `frameworks/vue` 与 `frameworks/vue-spa`), 而不是依赖语言变体来覆盖 `scripts`。

