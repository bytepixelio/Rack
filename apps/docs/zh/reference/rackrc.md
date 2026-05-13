---
aside: false
---

# 配置文件

Rack 使用 `~/.rackrc` 管理 Registry 源地址与访问凭证, 该配置对当前用户的所有项目生效。

## 配置结构

`.rackrc` 是一个 JSON 文件, 目前支持以下顶级字段:

```json
{
  "registries": {
    "@rack": "https://registry.rackjs.com"
  }
}
```

### registries

以命名空间为键, 为每个 Registry 声明访问入口。值可以是字符串或对象:

- **字符串**: 仅声明 Registry URL。
- **对象**: 至少包含 `url`, 可选 `headers` (自定义请求头) 和 `token` (Bearer 令牌)。

```json
{
  "registries": {
    "@rack": "https://registry.rackjs.com",
    "@company": {
      "url": "https://registry.company.com",
      "headers": {
        "X-API-Version": "v2"
      },
      "token": "your-token-here"
    }
  }
}
```

> `token` 字段在配置文件中独立保存, CLI 在解析配置或发起请求时会临时展开为 `Authorization: Bearer <token>` 请求头, 不会写回 `headers`。如果同时在 `headers` 中显式声明了 `Authorization`, 则会被 `token` 展开后的值覆盖。

### 常见场景

- 引入企业内部 Registry: 为 `@company` 或其他私有命名空间声明自托管地址。
- 设置访问令牌: 直接填 `token` 字段, 或通过自定义请求头携带 PAT、API Key。
- 定制请求: 添加 `X-` 前缀头以控制审计、版本或多租户路由。

## 使用 CLI 管理

推荐使用 `rk config` 命令维护 `.rackrc`, 避免手动编辑造成格式错误。

### 基本命令

- 查看全部配置: `rk config list` (别名: `ls`)
- 查询指定命名空间: `rk config get @namespace [--json]`
- 新增或更新源: `rk config set @namespace --url <url> [--token <token>] [--header "Key: Value"]`
- 移除源: `rk config remove @namespace` (别名: `rm`, 使用 `-f` 跳过确认)

### 高级功能

- **增量更新**: `set` 会与现有条目合并, 不会清空未提供的字段; `--header` 在已有 headers 上叠加同名键覆盖。
- **Token 简化**: `--token` 在配置文件中保存为 `token` 字段, 在显示与发起请求时统一展开为 `Authorization: Bearer <token>` 请求头。
- **命名空间保护**: 内置的 `@rack` 与 `@presets` 命名空间禁止删除; `set/get/remove` 仅校验命名空间是否以 `@` 开头, 完整正则在 `rk init`/`rk add` 解析标识符时再校验。`@presets` 默认指向与 `@rack` 相同的 Registry 根（§6.16）, 未配置的命名空间不再回退, 直接返回 `REGISTRY_NOT_FOUND`。

> 当前版本的 `rk config get/list` 不会对 Token 或敏感请求头做掩码处理; `rk config set` 也不会对 `--url` 做连通性探测。如需校验源是否可达, 请运行 `rk doctor`。

## 手动编辑与校验

如果需要直接修改 `.rackrc`, 建议流程如下:

```bash
# 打开文件
vi ~/.rackrc

# 保存后快速检查
rk config list
```

- 保持标准 JSON, 不支持注释。
- 提前创建目录并限制权限, 避免泄露访问令牌。
- CI 环境可通过写入临时 `.rackrc` 后执行 `rk config list` 校验配置是否生效。
