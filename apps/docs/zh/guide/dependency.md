---
aside: false
---

# 依赖解析规则

Rack 会自动解析 Registry 之间的依赖关系, 确保所有必需的模块都被正确安装。

## 依赖声明

Registry 通过 `registryDependencies` 字段声明依赖。

```json
{
  "name": "vue-router",
  "type": "registry:feature",
  "registryDependencies": ["frameworks/vue"]
}
```

这表示 `vue-router` 需要 `vue` 才能正常工作。

## 依赖解析流程

当执行 `rk add features/vue-router` 时, Rack 会执行以下步骤。

#### 1. 下载 Registry JSON

```
下载 features/vue-router 的 registry.json
```

#### 2. 递归解析依赖

```
发现 vue-router 依赖 frameworks/vue
→ 下载 frameworks/vue 的 registry.json
  → 发现 vue 依赖 runtimes/node
    → 下载 runtimes/node 的 registry.json
      → node 无依赖, 解析完成
```

```
features/vue-router
└── frameworks/vue
    └── runtimes/node
```

#### 3. 构建依赖图

使用拓扑排序算法构建安装顺序。

```
runtimes/node (无依赖, 最先)
    ↓
frameworks/vue (依赖 node)
    ↓
features/vue-router (依赖 vue)
```

#### 4. 检测循环依赖

如果发现循环依赖, Rack 会抛出错误。

```
CircularDependencyError:
  features/A → features/B → features/C → features/A
```

**示例**

```json
// features/A
{ "registryDependencies": ["features/B"] }

// features/B
{ "registryDependencies": ["features/C"] }

// features/C
{ "registryDependencies": ["features/A"] }  // 循环依赖
```

#### 5. 验证冲突

检查待安装的 Registry 是否与已安装的 Registry 冲突。

```bash
# 已安装
rk add frameworks/vue

# 尝试安装 (会报错)
rk add frameworks/react
```

**错误信息**

```
ConflictError:
  frameworks/react conflicts with frameworks/vue
```

#### 6. 版本解析

当多个 Registry 依赖同一个 `npm` 包时, Rack 会解析版本冲突。

```json
// frameworks/vue
{ "dependencies": { "vue": "^3.4.0" } }

// features/pinia
{ "dependencies": { "vue": "^3.3.0" } }
```

**解析规则**

**版本相同** → 保留该版本

```json
vue: "^3.4.0" + vue: "^3.4.0" → "^3.4.0"
```

**版本兼容** → 使用较新版本

```json
vue: "^3.4.0" + vue: "^3.3.0" → "^3.4.0"
```

**版本不兼容** → 优先级数字小的版本胜出

```json
vue: "^3.4.0" (priority: 2) + vue: "^2.7.0" (priority: 4) → "^3.4.0"
```

::: tip 为什么是数字小的胜出？
优先级数字小的 Registry（如框架层 priority: 2）是基础依赖，其版本要求应优先满足。
:::

## 依赖关系与优先级

Rack 使用依赖关系和[优先级系统](/zh/guide/priority)共同决定最终的安装顺序。

::: tip 核心原则
**依赖关系**（硬约束）优先于**优先级数字**（软约束）。

被依赖的 Registry 必须先安装, 即使它的优先级数字更大。
:::

### 排序算法

```
最终安装顺序 = 按依赖层级排序 + 同层级内按优先级数字排序
```

**规则**:

1. 先计算每个 Registry 的依赖层级（无依赖为层级 0, 依赖层级 N 的为层级 N+1）
2. 按层级从低到高排序（依赖必须先安装）
3. 同一层级内按优先级数字从小到大排序

### 示例

假设有以下 Registry:

```json
{
  "items": [
    {
      "name": "A",
      "priority": 1,
      "registryDependencies": ["B"] // A 依赖 B
    },
    {
      "name": "B",
      "priority": 4
    }
  ]
}
```

**排序结果**: `B → A`

**分析**:

- B 的层级是 0（无依赖）, A 的层级是 1（依赖 B）
- 虽然 A 的优先级（1）小于 B（4）, 但依赖关系决定了 B 必须先安装
- 依赖关系（硬约束）优先于优先级数字（软约束）

## 冲突声明

使用 `conflicts` 字段声明不兼容的 Registry, 安装时一旦命中即报错并提示原因。

```json
{
  "name": "vue",
  "type": "registry:framework",
  "conflicts": ["frameworks/react", "frameworks/svelte"]
}
```
