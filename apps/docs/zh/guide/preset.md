---
aside: false
---

# Preset 模板

Preset 模板是预先配置好的 Registry 组合, 用于快速初始化特定类型的项目。

## 什么是模板？

Preset 模板将一组常用的 Registry 打包在一起, 形成完整的项目模板。使用模板可以一次性安装所有需要的 Registry, 无需逐个添加。

```bash
# 不使用模板 - 先以单个 Registry 初始化, 再逐个添加
rk init -t runtimes/node -n my-project
cd my-project
rk add frameworks/vue
rk add build/vite
rk add features/vue-router
rk add features/pinia
rk add quality/eslint

# 使用模板 - 一次完成
rk init -t @presets/tutorial-project -n my-project
```

## 使用模板

#### 初始化项目

```bash
rk init -t @presets/tutorial-project
```

#### 指定项目名称

```bash
rk init -t @presets/tutorial-project -n my-project
```

#### CI 模式

在 CI 环境中跳过交互式提示。

```bash
rk init -t @presets/tutorial-project --ci
```

## 创建模板

### 1. 创建 preset.json

```json
{
  "$schema": "https://registry.rackjs.com/schemas/preset.json",
  "name": "my-preset",
  "version": "1.0.0",
  "description": "我的自定义预设",
  "author": "Your Name",
  "tags": ["custom", "preset"],
  "registries": [
    "runtimes/node",
    "frameworks/vue",
    "build/vite",
    "features/vue-router"
  ]
}
```

### 2. 目录结构

```bash
my-presets/
└── my-preset/
    └── preset.json
```

### 3. 部署模板

CLI 按 `{host}/presets/{path}` 拉取 preset (URL 不带 `/preset.json` 后缀, 也不带命名空间段)。

**推荐: `@rack/registry-server`**

直接用 [Registry Server](/zh/guide/registry-server/overview) —— 它内置 `/presets/...` 路由, 上传时自动落到正确路径。

**自建静态文件服务器**

把 `preset.json` 放到对应路径, 并配置 rewrite 让 `/presets/my-preset` 返回 `preset.json` 的 JSON 内容。

```bash
# 静态服务器根目录布局
https://registry.company.com/
└── presets/
    └── my-preset/
        └── preset.json    # 对应 URL: /presets/my-preset
```

**CLI 实际访问的 URL**

```
https://registry.company.com/presets/my-preset
```

### 4. 配置和使用

```bash
# 配置私有源
rk config set @mypresets --url https://registry.company.com

# 使用自定义模板
rk init -t @mypresets/my-preset
```

