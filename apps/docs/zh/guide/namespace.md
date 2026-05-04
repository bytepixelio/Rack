---
aside: false
---

# 命名空间

命名空间用于区分和管理不同来源的 Registry。

## 什么是命名空间？

命名空间是 Registry ID 的第一部分, 用 `@` 符号开头, 表示 Registry 的来源。

```
@namespace/path/to/registry
   ↑          ↑
 命名空间   Registry 路径
```

**示例**

- `@company/ui-kit` - `@company` 是命名空间, `ui-kit` 是路径
- `@company/runtimes/node` - `@company` 是命名空间, `runtimes/node` 是路径
- `@team/internal-config` - `@team` 是命名空间, `internal-config` 是路径

## 为什么需要命名空间？

命名空间为不同来源的 Registry 提供独立的解析与访问入口:

- **来源映射**: 每个命名空间独立配置 URL 与认证 (例如 `@rack` → 官方源, `@company` → 企业内网源)。
- **避免冲突**: 名称相同但命名空间不同的 Registry 不会互相覆盖 (`@official/ui-kit` 与 `@company/ui-kit` 共存)。
- **访问控制**: 服务端按命名空间维度配置 Token 与发布权限, 不同团队互不影响。

::: tip 官方 Registry 简写
官方 Registry 可以省略 `@rack` 前缀, 直接使用 `runtimes/node`, `frameworks/vue` 等形式 (CLI 会自动解析为 `@rack/runtimes/node`)。
:::

## 命名空间格式

命名空间必须符合以下规则 (CLI 在解析标识符时强制约束):

- 以 `@` 开头
- 仅允许小写字母、数字、`-` 与 `_` (大写会被自动转为小写后再校验)
- 第一个与最后一个字符必须是小写字母或数字
- 不能包含空格或其它特殊字符

> 正则: `^@[a-z0-9](?:[a-z0-9-_]*[a-z0-9])?$`

**有效的命名空间**

```
✓ @rack
✓ @company
✓ @my-org
✓ @internal_team
✓ @org2024
```

**无效的命名空间**

```
✗ rack           # 缺少 @
✗ @my org        # 包含空格
✗ @-company      # 不能以 - 开头
✗ @company!      # 包含特殊字符
✗ @_internal     # 不能以 _ 开头
✗ @internal_     # 不能以 _ 结尾
```

> `rk config set/get/remove` 在校验命名空间时只判断 `@` 前缀; 上述完整规则在 `rk init` / `rk add` 解析标识符时才会生效。

## 官方 Registry 与简写

官方 Registry 都位于 `@rack` 命名空间下, 路径按 [Registry 类型](/zh/guide/registry#registry-类型) (`runtimes/`, `frameworks/`, `build/`, ...) 组织。简写形式 (省略 `@rack/`) 会被 CLI 自动还原为完整命名空间。

```bash
rk add @rack/runtimes/node     # 完整形式
rk add runtimes/node           # 简写, 等价于上一行
```

## 配置命名空间源

### 默认配置

Rack 默认使用官方源, 配置文件位于 `~/.rackrc`。

```json
{
  "registries": {
    "@rack": "https://registry.rackjs.com"
  }
}
```

所有未明确配置的命名空间都会回退到 `@rack` 源。

### 添加私有源

企业可以配置私有命名空间指向内部 Registry 服务器。

```bash
rk config set @company --url https://registry.company.com
```

添加后的配置。

```json
{
  "registries": {
    "@rack": "https://registry.rackjs.com",
    "@company": "https://registry.company.com"
  }
}
```

### 带认证的私有源

为私有源添加认证信息。

```bash
rk config set @company --url https://registry.company.com --token your-token-here
```

也可以用 `--header "Key: Value"` 直接传入自定义请求头。

```bash
rk config set @company --url https://registry.company.com \
  --header "X-API-Version: v2"
```

**配置结果 (~/.rackrc)**

`--token` 在文件中保存为独立的 `token` 字段, CLI 在发起请求或显示配置时才会展开为 `Authorization: Bearer <token>` 请求头, 不会写回 `headers`。

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

### 查看已配置的命名空间

```bash
rk config list
```

**输出示例 (Token 会以明文 Authorization Bearer 形式展示)**

```
Configuration for @rack:
  URL:      https://registry.rackjs.com
Configuration for @company:
  URL:      https://registry.company.com
  Headers:
    Authorization -> Bearer your-token-here
    X-API-Version -> v2
```

> 当前版本不会对 Token 或敏感请求头做掩码处理, 请妥善保护本机的 `~/.rackrc` 与终端输出。

### 移除命名空间配置

```bash
# 别名: rm; 加 -f 跳过确认
rk config remove @company
```

移除后, 该命名空间会回退到默认的 `@rack` 源。默认的 `@rack` 命名空间禁止删除。

## 命名空间解析规则

当执行 `rk add @namespace/name` 时, Rack 按以下顺序查找配置。

#### 1. 精确匹配

优先使用与命名空间完全匹配的配置。

```bash
# 配置
{
  "@company": "https://registry.company.com"
}

# 命令
rk add @company/ui-kit
# → 使用 https://registry.company.com
```

#### 2. 回退到默认源

如果命名空间未配置, 回退到 `@rack` 源。

```bash
# 配置
{
  "@rack": "https://registry.rackjs.com"
}

# 命令 (简写形式)
rk add frameworks/vue
# → 简写格式, 自动解析为 @rack
# → 最终 URL: https://registry.rackjs.com/registries/@rack/frameworks/vue
```

## Registry URL 结构

Rack 根据命名空间配置和 Registry 路径构建 URL, `/registries/` 前缀和命名空间段都会保留在 URL 中。

```
Registry ID:  @namespace/path/to/name@version
配置映射:      @namespace → {host}
最终 URL:     {host}/registries/{@namespace}/{path}[/{version}]
```

> URL 末尾不带 `/registry.json` —— Server / Worker 会把请求映射到对应的 `registry.json` 内容并返回 JSON。当 Registry ID 不带版本号时, URL 也省略版本段; CLI 在拿到响应后再用 `item.version` 拼出模板文件的实际下载路径。

**官方 Registry 示例**

```bash
# Registry ID
runtimes/node

# 源配置
@rack → https://registry.rackjs.com

# 最终 URL (省略命名空间的简写也会被还原为 @rack)
https://registry.rackjs.com/registries/@rack/runtimes/node
```

**企业 Registry 示例**

```bash
# 无版本
Registry ID:  @company/ui-kit
最终 URL:     https://registry.company.com/registries/@company/ui-kit

# 带版本
Registry ID:  @company/runtimes/node@1.2.3
最终 URL:     https://registry.company.com/registries/@company/runtimes/node/1.2.3
```

## 故障排查

#### 认证失败

**错误信息**

```
Error: 401 Unauthorized
```

**解决方法**

检查 Token 是否过期, 更新认证信息。

```bash
rk config set @company --url https://registry.company.com --token new-token-here
```

#### 命名空间冲突

**错误信息**

```
Warning: Namespace @company is already configured
```

**解决方法**

使用 `rk config set` 会自动覆盖已有配置, 或先删除。

```bash
rk config remove @company
rk config set @company --url https://new-registry.company.com
```
