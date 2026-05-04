---
aside: false
---

# 文件合并策略

当多个 Registry 尝试修改同一个文件时, Rack 使用智能合并策略来避免冲突。

## 为什么需要文件合并？

不同的 Registry 可能需要修改相同的文件。

- 所有 Registry 都可能添加 npm scripts 到 `package.json`
- 多个工具可能配置 `tsconfig.json`
- 不同模块都可能往 `.gitignore` 添加忽略规则

Rack 根据文件类型采用不同的合并策略, 确保配置正确且不丢失信息。

::: tip 核心原则

- **安装顺序决定覆盖优先级**: 后安装的 Registry 覆盖先安装的 Registry
- **文件类型决定合并策略**: 配置文件深度合并, 代码文件完全替换, 忽略文件去重追加
  :::

## 合并策略类型

#### 深度合并

**适用文件**: `package.json`, `tsconfig.json`

**策略**: 递归合并对象, 数组去重合并, 后安装的值覆盖先安装的。

#### 合并 `package.json`

```json
// 步骤 1: runtimes/node (priority: 1) 先安装
{
  "name": "my-project",
  "scripts": {
    "dev": "tsx src/index.ts"
  },
  "dependencies": {
    "express": "^4.19.0"
  },
  "devDependencies": {
    "typescript": "^5.9.2"
  }
}
```

```json
// 步骤 2: quality/prettier (priority: 6) 后安装
{
  "scripts": {
    "format": "prettier --write .",
    "dev": "prettier --check . && tsx src/index.ts"
  },
  "devDependencies": {
    "prettier": "^3.0.0"
  }
}
```

```json
// 合并结果
{
  "name": "my-project",
  "scripts": {
    "dev": "prettier --check . && tsx src/index.ts", // ← prettier 后安装, 覆盖 node 的配置
    "format": "prettier --write ." // ← 新增
  },
  "dependencies": {
    "express": "^4.19.0"
  },
  "devDependencies": {
    "typescript": "^5.9.2",
    "prettier": "^3.0.0" // ← 新增
  }
}
```

**合并规则**

- **对象字段**: 递归合并
- **scripts 冲突**: 后安装的覆盖先安装的
- **dependencies**: 合并所有依赖, 版本冲突按优先级解决
- **数组字段**: 去重后合并

#### 合并 `tsconfig.json`

```json
// 步骤 1: runtimes/node (priority: 1) 先安装
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "strict": true
  }
}
```

```json
// 步骤 2: frameworks/vue (priority: 2) 后安装
{
  "compilerOptions": {
    "jsx": "preserve",
    "moduleResolution": "bundler",
    "strict": false
  }
}
```

```json
// 合并结果
{
  "compilerOptions": {
    "target": "ES2022", // ← 来自 node (未冲突)
    "module": "ESNext", // ← 来自 node (未冲突)
    "strict": false, // ← vue 后安装, 覆盖 node 的 true
    "jsx": "preserve", // ← 来自 vue (新增)
    "moduleResolution": "bundler" // ← 来自 vue (新增)
  }
}
```

#### 行去重追加

**适用文件**: `.gitignore`, `.dockerignore`, `.npmignore`

**策略**: 逐行读取, 去重后追加新行。

```text
# 现有 .gitignore
node_modules
dist
.env
```

```text
# 新 Registry 添加
dist
build
*.log
```

```text
# 合并结果
node_modules
dist              # 去重，只保留一次
.env
build             # 新增
*.log             # 新增
```

**合并规则**

- 保留原有所有行
- 新行如果不存在则追加
- 保持原有顺序

#### 完全覆盖

**适用文件**: 代码文件 (`.js`, `.ts`, `.vue`, `.jsx`, `.tsx` 等)

**策略**: 后安装的完全覆盖先安装的。

```typescript
// 步骤 1: runtimes/node (priority: 1) 先安装, 创建 src/index.ts
import express from 'express'

const app = express()
app.listen(3000)
```

```typescript
// 步骤 2: frameworks/vue (priority: 2) 后安装, 也要创建 src/index.ts
import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')
```

```typescript
// 合并结果
// vue 后安装, 完全覆盖 node 的版本
import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')
```

**合并规则**

- 后安装的文件完全替换先安装的文件
- 不保留先安装文件的任何内容
- 如果优先级相同, 后来的覆盖先前的（并给出警告）

**为什么这样设计?**

代码文件无法像配置文件那样"合并", 必须选择一个版本。后安装的通常代表更具体的场景, 应该覆盖通用的基础代码。

#### 智能合并

**适用文件**: `.env`, `.env.example`

**策略**: 按 key 合并, 后安装的值覆盖先安装的。

```bash
# 步骤 1: runtimes/node (priority: 1) 先安装, 创建 .env
NODE_ENV=development
PORT=3000
DB_HOST=localhost
```

```bash
# 步骤 2: frameworks/vue (priority: 2) 后安装, 添加 .env
PORT=8080
API_URL=https://api.example.com
```

```bash
# 合并结果
NODE_ENV=development
PORT=8080              # ← vue 后安装, 覆盖 node 的 3000
DB_HOST=localhost
API_URL=https://api.example.com  # ← 新增
```

## 文件类型判断

Rack 根据文件路径和扩展名判断使用哪种策略：

| 文件模式                                                                                                      | 合并策略   | 说明               |
| ------------------------------------------------------------------------------------------------------------- | ---------- | ------------------ |
| `package.json` / `tsconfig.json` / `tsconfig.app.json` / `tsconfig.base.json` / `jsconfig.json` / `rack.json` | 深度合并   | 已知的 JSON 配置   |
| `*.schema.json`                                                                                               | 深度合并   | JSON Schema 文件   |
| `.gitignore` / `.npmignore` / `.dockerignore` / `.eslintignore` / `.prettierignore`                           | 行去重追加 | 已知的 ignore 文件 |
| `.env*` (例如 `.env`, `.env.example`, `.env.local`)                                                           | 智能合并   | 环境变量文件       |
| 其他所有文件 (含未列入白名单的 `*.json`、代码文件 `*.ts` / `*.js` / `*.vue`、文档 `*.md` 等)                  | 完全覆盖   | 默认策略           |

> 想让某个文件走指定策略, 在 `registry.json` 的 `files[].mergeStrategy` 上显式声明即可 (见下文"自定义合并策略")。

## 合并冲突处理

CLI 不会暂停等待用户裁决: 冲突字段始终按"后安装覆盖先安装"自动解决, 同优先级则按当次安装顺序决定。如果结果不符合预期, 直接编辑生成的目标文件 (例如 `package.json`) 即可。

## 自定义合并策略

在 `registry.json` 的 `files` 数组中，为文件添加 `mergeStrategy` 字段来指定合并策略：

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

### 内置策略

| 策略名称    | 说明          | 适用场景                           |
| ----------- | ------------- | ---------------------------------- |
| `json`      | JSON 深度合并 | JSON 配置文件                      |
| `ignore`    | 行去重追加    | `.gitignore`、`.npmignore`         |
| `env`       | 按 key 合并   | `.env`、`.env.example`             |
| `overwrite` | 完全覆盖      | 代码文件、文档文件、二进制资源文件 |

> 说明：`registry:asset`（且使用 `path`）会走二进制写入流程，默认使用覆盖行为，不支持 `json` / `ignore` / `env` / `custom` 这类文本合并策略。

### 示例

两个 Registry 都把 `myconfig.json` 标记为 `mergeStrategy: { type: "builtin", strategy: "json" }`, 模板分别写入:

```json
// feature-a/templates/myconfig.json
{ "plugins": ["plugin-a"], "settings": { "option1": "value1" } }

// feature-b/templates/myconfig.json
{ "plugins": ["plugin-b"], "settings": { "option2": "value2" } }
```

合并结果 (数组去重追加, 对象递归合并):

```json
{
  "plugins": ["plugin-a", "plugin-b"],
  "settings": {
    "option1": "value1",
    "option2": "value2"
  }
}
```

### 自定义插件

对于复杂的合并场景，可以使用自定义插件来实现特殊的合并逻辑。

#### 创建插件

插件是一个 JavaScript 模块（支持 ES Modules 或 CommonJS），需要导出一个 `merge` 函数：

```javascript
// scripts/merge-myconfig.js
export function merge(params, helpers) {
  const current = params.currentContent ? JSON.parse(params.currentContent) : {}
  const incoming = JSON.parse(params.incomingContent)

  // 自定义合并逻辑
  const merged = {
    ...current,
    ...incoming,
    // 特殊处理：合并数组并去重
    plugins: [...(current.plugins || []), ...(incoming.plugins || [])].filter(
      (v, i, arr) => arr.indexOf(v) === i
    )
  }

  // 可以使用 helpers 中的环境信息（如 language）
  if (helpers.language === 'ts') {
    // TypeScript 特定的合并逻辑
  }

  return {
    content: JSON.stringify(merged, null, 2) + '\n',
    changed: true,
    warnings: []
  }
}
```

#### 使用插件

在 `registry.json` 中指定插件路径：

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

#### 插件接口

插件必须导出以下接口：

```typescript
interface MergeParams {
  filePath: string // 目标文件路径
  currentContent?: string // 现有文件内容（如果存在）
  incomingContent: string // 新文件内容
  fileDescriptor?: object // 文件描述符
}

interface MergeHelpers {
  language?: string // 语言变体（如 'ts', 'js'）
}

interface MergeResult {
  content: string // 合并后的内容
  changed: boolean // 是否发生变更
  warnings?: Array<{
    // 警告信息（可选）
    message: string
  }>
}

// 插件导出
export function merge(
  params: MergeParams,
  helpers: MergeHelpers
): MergeResult | Promise<MergeResult>
```

**重要提示**：

1. **文件不存在时**：`currentContent` 会是 `null` 或 `undefined`，插件需要自行处理：

   ```javascript
   export function merge(params, helpers) {
     const current = params.currentContent
       ? JSON.parse(params.currentContent)
       : {} // 文件不存在时使用空对象作为默认值
     // ...
   }
   ```

2. **使用环境信息和工具函数**：`helpers` 参数提供 CLI 环境信息和辅助工具，可用于自定义合并逻辑：
   ```javascript
   export function merge(params, helpers) {
     // 根据语言变体调整合并策略
     if (helpers.language === 'ts') {
       // TypeScript 特定的处理
     }
     // ...
   }
   ```

#### 插件路径

- **本地 Registry**：`script` 路径相对于 Registry 根目录
- **远程 Registry**：插件会被下载到临时目录执行

#### 注意事项

- 插件支持 ES Modules 和 CommonJS
- 插件可以是同步或异步函数
- 插件路径会进行安全检查，防止路径遍历攻击
