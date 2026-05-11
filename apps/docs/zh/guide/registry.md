---
aside: false
---

# 注册表

Registry 是 Rack 的核心概念, 它是一个描述技术栈模块的 JSON 配置文件。

## 什么是 Registry?

每个 Registry 就像一个配置包, 它完整地定义了某个技术栈模块应该如何被应用到项目中。

- 需要安装哪些 `npm` 依赖
- 需要创建或修改哪些文件
- 需要添加哪些 `npm` 脚本
- 依赖或冲突哪些其他 Registry

## Registry 类型

| 类型                 | 说明     | 示例                                      | 推荐优先级 |
| -------------------- | -------- | ----------------------------------------- | ---------- |
| `registry:runtime`   | 运行环境 | `Node.js` `Bun` `Deno`                    | 1          |
| `registry:framework` | 应用框架 | `Vue.js` `React` `Next.js`                | 2          |
| `registry:build`     | 构建工具 | `Vite` `Webpack` `PostCSS` `Rollup`       | 3          |
| `registry:feature`   | 功能特性 | `Vue Router` `TailwindCSS` `React Router` | 4          |
| `registry:testing`   | 测试工具 | `Vitest` `Jest` `Playwright`              | 5          |
| `registry:quality`   | 质量工具 | `ESLint` `Prettier` `CommitLint`          | 6          |

## Registry 结构

一个典型的 Registry 包含以下部分。

```json
{
  "$schema": "https://registry.rackjs.com/schemas/registry-item.json",
  "name": "node",
  "type": "registry:runtime",
  "version": "1.0.0",
  "description": "Minimal Node.js runtime setup with TypeScript tooling.",
  "priority": 1,
  "tags": ["node", "typescript", "runtime"],
  "devDependencies": {
    "typescript": "^5.9.2",
    "tsx": "^4.20.6"
  },
  "files": [
    {
      "target": "package.json",
      "type": "registry:config",
      "path": "./templates/node/ts/package.json"
    },
    {
      "target": "tsconfig.json",
      "type": "registry:config",
      "path": "./templates/node/ts/tsconfig.json"
    },
    {
      "target": "src/index.ts",
      "type": "registry:entry",
      "path": "./templates/node/ts/src/index.ts"
    }
  ]
}
```

:::tip 语言变体
上面的示例是一个只支持 `TypeScript` 的 Registry。如果需要创建同时支持 `JavaScript` 和 `TypeScript` 的 Registry, 请参考 [语言变体](/zh/guide/language-variants) 文档。
:::

完整的 Registry 结构说明请参考 [registry-item.json](/zh/reference/schema/registry-item)。

## Registry 依赖关系

Registry 之间可以声明依赖和冲突关系。

### 依赖关系

当一个 Registry 需要另一个 Registry 才能正常工作时, 使用 `registryDependencies` 字段。

```json
{
  "name": "vue-router",
  "type": "registry:feature",
  "registryDependencies": ["frameworks/vue"]
}
```

执行 `rk add features/vue-router` 时, Rack 会自动安装 `frameworks/vue`。

### 冲突关系

当两个 Registry 不能同时存在时, 使用 `conflicts` 字段。

```json
{
  "name": "vue",
  "type": "registry:framework",
  "conflicts": ["frameworks/react", "frameworks/nextjs"]
}
```

如果项目中已经有 `React`, 尝试添加 `Vue` 时会报错。

## Registry 的工作流程

当执行 `rk add runtimes/node` 时, Rack 会:

1. **下载 Registry** - 从配置的源下载 `node` 的 JSON 配置
2. **解析依赖** - 检查 `registryDependencies`, 递归下载所有依赖的 Registry
3. **检测冲突** - 验证没有 `conflicts` 中声明的 Registry 已安装
4. **合并文件** - 根据优先级规则智能合并文件 (详见 [文件合并策略](/zh/guide/file-merge))
5. **安装依赖** - 执行 `npm install` 安装 npm 包
6. **更新配置** - 将所有应用的 Registry（包括传递依赖）记录到 `rack.json` 的 `items` 数组中

## Registry 来源

`@rack` 命名空间下的官方 Registry 可直接 `rk add runtimes/node`; 接入企业私有源后即可通过 `@company/...` 标识符使用。命名空间配置与认证细节请参考 [命名空间](/zh/guide/namespace) 与 [认证](/zh/guide/authentication)。
