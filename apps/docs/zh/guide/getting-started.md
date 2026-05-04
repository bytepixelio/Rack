---
aside: false
---

# 快速开始

## 安装

使用 `npm` 全局安装 Rack CLI。

```bash
npm install -g rackjs-cli
```

验证安装。

```bash
rk version
```

## 初始化项目

### 使用预设模版

最简单的方式是使用预设模版初始化项目。

```bash
rk init -t @presets/tutorial-project
```

Rack 会询问项目名称, 然后自动完成以下操作。

- 下载并解析模版中包含的所有 Registry
- 检测依赖关系和冲突
- 生成项目文件和配置
- 安装 `npm` 依赖
- 创建 `rack.json` 配置文件

### 手动选择 Registry

如果想更灵活地组合技术栈, 可以先用单个 Registry 初始化项目, 再按需追加。

```bash
# 以 Node 运行时为模板初始化最小项目
rk init -t runtimes/node -n my-project
cd my-project
```

然后逐个添加需要的 Registry。

```bash
# 添加框架
rk add frameworks/vue

# 添加构建工具
rk add build/vite
```

> `rk init` 必须通过 `-t/--template` 指定模板, 模板可以是 Preset (`@presets/...`) 也可以是单个 Registry。`rk add` 可以在任意已有的项目目录运行, 没有 `rack.json` 时会按目录名生成最小配置后再继续。

## 配置私有 Registry 源

默认情况下 CLI 使用官方源 `@rack` → `https://registry.rackjs.com`。如需接入企业内部源:

```bash
rk config set @company --url https://registry.company.com --token your-token-here
```

详细规则参见 [命名空间](/zh/guide/namespace) 与 [认证](/zh/guide/authentication)。

## 健康检查

`rk doctor` 会并行检查 Node 版本、`git`、当前 `rack.json` 与所有已配置 Registry 的 `/health` 端点。完整说明见 [CLI 参考](/zh/reference/cli#rk-doctor)。
