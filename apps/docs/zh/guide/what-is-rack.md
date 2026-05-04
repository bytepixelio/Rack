---
aside: false
---

# 什么是 Rack？

Rack 是一个基于 **Registry 架构**的模块化项目脚手架工具。

通过组合不同的 Registry 可以快速创建和配置项目, 就像搭积木一样灵活。

## 核心特性

Rack 通过 Registry 架构提供了以下核心特性:

- **配置模块化** - 将技术栈拆分为独立的 Registry, 可以自由组合和复用
- **增量扩展** - 项目初始化后仍可以随时添加新的功能模块
- **依赖管理** - 自动处理 Registry 之间的依赖关系和版本冲突
- **企业分发** - 支持私有 Registry 源, 便于团队内部分享和管理配置

## Registry 机制

Rack 的核心是 **Registry**。每个 Registry 是一个 JSON 配置文件, 描述了技术栈的某个模块应该如何配置: 需要安装哪些 npm 包、创建哪些配置文件、依赖或冲突哪些其他 Registry。

当执行 `rk init` 或 `rk add` 命令时, Rack 会分析 Registry 之间的依赖关系, 检测冲突, 然后根据优先级规则智能合并配置文件, 最后安装所需的依赖包。

## 快速示例

初始化一个 `Vue` 全栈项目:

```bash
rk init -t @presets/tutorial-project
```

向现有项目添加状态管理:

```bash
rk add features/pinia
```

配置企业私有源:

```bash
rk config set @company --url https://registry.company.com --token your-token-here
```
