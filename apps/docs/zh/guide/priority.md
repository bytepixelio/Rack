---
aside: false
---

# 优先级系统

优先级系统是 Rack 解决 Registry 安装顺序和文件冲突的核心机制。

## 为什么需要优先级？

当组合多个 Registry 时, 会遇到两个关键问题, 分别是**安装顺序**和**文件冲突**。

#### 安装顺序

不同技术栈之间存在依赖关系, 必须按正确顺序安装。

```bash
# 错误: 先安装框架, 但运行时环境还不存在
1. 安装 Vue.js  → 失败（没有 Node.js 运行时）
2. 安装 Node.js → 太晚了

# 正确: 先安装基础, 再安装上层
1. 安装 Node.js → 提供运行时环境
2. 安装 Vue.js  → 可以正常工作
```

#### 文件冲突

多个 Registry 可能要修改同一个文件, 需要决定谁的配置生效。

```json
// Node.js 运行时想设置:
{ "scripts": { "dev": "node src/index.js" } }

// Vite 构建工具想设置:
{ "scripts": { "dev": "vite" } }

// 最终应该使用哪个?
```

**优先级系统**通过为每个 Registry 分配一个优先级数字（推荐 1-6, 用户可自定义）, 明确定义了安装顺序和冲突解决规则。

## 优先级规则

优先级数字 (`priority`) 有两层含义:

1. **安装顺序**: 数字越小越先安装 (`1 → 2 → 3 → ...`)
2. **文件合并**: 后安装的覆盖先安装的

约定的标准层级见 [Registry 类型](/zh/guide/registry#registry-类型) (Runtime=1, Framework=2, Build=3, Feature=4, Testing=5, Quality=6); 也可以根据需要使用其它非负整数 (例如自定义工具用 10、100)。

## 优先级作用

### 1. 决定安装顺序

当执行 `rk add` 或 `rk init` 时, Rack 会按优先级从低到高排序。

```bash
rk add runtimes/node frameworks/vue build/vite testing/vitest quality/eslint
```

**实际安装顺序**

```
1. runtimes/node        (priority: 1)
2. frameworks/vue       (priority: 2)
3. build/vite           (priority: 3)
4. testing/vitest       (priority: 5)
5. quality/eslint       (priority: 6)
```

### 2. 解决文件冲突

当多个 Registry 修改同一个文件时, 优先级决定合并策略。

**冲突场景示例** (假设同时安装 `Runtime` 和 `Framework`)

```json
// runtimes/node (priority: 1) 先安装, 写入:
{
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc"
  }
}

// frameworks/vue (priority: 2) 后安装, 写入:
{
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  }
}
```

#### 合并策略

对于配置文件, 采用**深度合并**策略, 后安装的覆盖先安装的。

```json
// 最终结果:
{
  "scripts": {
    "dev": "vite", // ← Vue 的配置覆盖了 Node 的配置
    "build": "vite build" // ← Vue 的配置覆盖了 Node 的配置
  }
}
```

对于代码文件, 采用**完全覆盖**策略, 后安装的文件替换先安装的文件。

```
# node 创建：
src/index.ts (通用的入口文件)

# vue 后续安装，覆盖：
src/main.ts (Vue 专用的入口文件)
```

**为什么这样设计?**

- node 提供的是**通用环境** (任何 Node.js 项目都能用)
- vue 提供的是**具体场景** (Vue.js 项目专用)
- 具体场景的配置应该覆盖通用配置, 项目才能正常运行

### 3. 依赖版本冲突解决

当两个 Registry 依赖同一个 `npm` 包的不同版本时。

```json
// frameworks/vue (priority: 2)
{
  "dependencies": {
    "vue": "^3.4.0"
  }
}

// features/pinia (priority: 4)
{
  "dependencies": {
    "vue": "^3.3.0"
  }
}
```

**解决规则**:

1. **版本兼容** - 取较新版本(`^3.4.0`)
2. **版本不兼容** - 优先级数字小的版本胜出(框架的 `^3.4.0`)

## 设置优先级

在创建 Registry 时, 按照 [Registry 类型](/zh/guide/registry#registry-类型) 的推荐值设置 `priority`。同类型的 Registry 应使用相同的优先级数字, 不要为了"强制覆盖"而调高优先级 — 该用 `conflicts` 声明互斥时就用 `conflicts`。
