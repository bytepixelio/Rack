---
aside: false
---

# 运维监控

确保 Registry Server 稳定运行, 提供健康检查、监控指标和日志管理等运维工具。

## 健康检查

Registry Server 提供 `/health` 端点用于健康检查。

### 基础健康检查

```bash
curl http://localhost:8080/health
```

**正常响应 (200 OK)**

```json
{
  "status": "ok",
  "checks": {
    "storage": {
      "status": "ok"
    }
  }
}
```

**异常响应 (503 Service Unavailable)**

```json
{
  "status": "error",
  "checks": {
    "storage": {
      "status": "error",
      "error": "Storage health check failed: ENOENT: no such file or directory"
    }
  }
}
```

### 在负载均衡中使用

**Nginx**

```nginx
upstream registry_backend {
    server 127.0.0.1:8080;
    server 127.0.0.1:8081;

    # 健康检查
    check interval=3000 rise=2 fall=3 timeout=1000;
    check_http_send "GET /health HTTP/1.0\r\n\r\n";
    check_http_expect_alive http_2xx;
}
```

**Docker Compose**

```yaml
services:
  registry-server:
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:8080/health']
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 10s
```

## Prometheus 监控

Registry Server 暴露 `/metrics` 端点, 提供 Prometheus 格式的监控指标。

### 指标端点

```bash
curl http://localhost:8080/metrics
```

**响应示例**

```
# HELP process_cpu_user_seconds_total Total user CPU time spent in seconds.
# TYPE process_cpu_user_seconds_total counter
process_cpu_user_seconds_total 0.61

# HELP process_resident_memory_bytes Resident memory size in bytes.
# TYPE process_resident_memory_bytes gauge
process_resident_memory_bytes 177012736

# HELP nodejs_heap_size_total_bytes Process heap size from Node.js in bytes.
# TYPE nodejs_heap_size_total_bytes gauge
nodejs_heap_size_total_bytes 121950208
```

### 可用指标

**进程指标**

- `process_cpu_user_seconds_total` - CPU 用户时间
- `process_cpu_system_seconds_total` - CPU 系统时间
- `process_resident_memory_bytes` - 常驻内存
- `process_open_fds` - 打开的文件描述符

**Node.js 指标**

- `nodejs_heap_size_total_bytes` - 堆总大小
- `nodejs_heap_size_used_bytes` - 已用堆大小
- `nodejs_eventloop_lag_seconds` - 事件循环延迟
- `nodejs_gc_duration_seconds` - GC 耗时

**HTTP 请求指标**

- `http_request_duration_seconds` - HTTP 请求耗时直方图
  - 标签: `method`, `route`, `status_code`
  - 桶: 1ms, 5ms, 10ms, 50ms, 100ms, 500ms, 1s, 5s, 10s

### 配置 Prometheus

在 `prometheus.yml` 中添加抓取任务:

```yaml
scrape_configs:
  - job_name: 'registry-server'
    static_configs:
      - targets: ['localhost:8080']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

启动 Prometheus:

```bash
# 使用 Docker
docker run -d \
  --name prometheus \
  -p 9090:9090 \
  -v $(pwd)/prometheus.yml:/etc/prometheus/prometheus.yml \
  prom/prometheus

# 访问 Prometheus UI
open http://localhost:9090
```

### Grafana 仪表盘

把 Prometheus 加为 Grafana 数据源后, 可基于上面列出的指标自行搭建仪表盘。常用 PromQL 表达式:

```
# 常驻内存 (MB)
process_resident_memory_bytes / 1024 / 1024
# CPU 使用率
rate(process_cpu_user_seconds_total[5m])
# 堆内存使用率
nodejs_heap_size_used_bytes / nodejs_heap_size_total_bytes * 100
# 事件循环延迟
nodejs_eventloop_lag_seconds
# HTTP 请求速率
rate(http_request_duration_seconds_count[5m])
# HTTP 请求耗时 (p99)
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))
```

## 日志管理

### 日志级别

通过 `LOG_LEVEL` 环境变量配置日志级别:

```bash
# 可选值: trace, debug, info, warn, error, fatal
LOG_LEVEL=info
```

**级别说明**

| 级别    | 说明                       | 适用场景       |
| ------- | -------------------------- | -------------- |
| `trace` | 最详细的日志, 包含所有信息 | 深度调试       |
| `debug` | 调试信息                   | 开发环境       |
| `info`  | 一般信息 (默认)            | 生产环境       |
| `warn`  | 警告信息                   | 生产环境       |
| `error` | 错误信息                   | 生产环境       |
| `fatal` | 致命错误                   | 仅记录严重问题 |

### 敏感头信息脱敏

请求日志会自动脱敏以下请求头 (替换为 `[REDACTED]`, 除非日志级别为 `debug` 或 `trace`):

- `authorization`
- `cookie` / `set-cookie`
- `x-registry-token`
- `proxy-authorization`

### 日志格式

Registry Server 使用结构化日志 (生产环境为 JSON 格式, 开发环境为美化输出):

**生产环境 (JSON)**

```json
{
  "level": 30,
  "time": 1699350000000,
  "pid": 12345,
  "hostname": "server01",
  "msg": "Server listening",
  "port": 8080
}
```

**开发环境 (美化输出)**

```
[10:30:00 +0800] INFO: Server listening {"port": 8080}
```

### 日志输出

服务器把日志写到 stdout / stderr, 由部署方式决定落盘方式:

- **PM2**: 默认写到 `~/.pm2/logs/registry-server-{out,error}.log`; 可在 `ecosystem.config.js` 中通过 `out_file` / `error_file` 自定义。
- **Docker**: 通过 `docker logs` 查看, 或挂载日志目录到宿主机。

## 内置性能特性

以下性能特性始终启用, 不可通过环境变量配置:

### 响应缓存

所有响应都会带 `Cache-Control: public, max-age=60`(由 `@fastify/caching` 全局加上)。模板文件下载路径 (`/registries/.../files/*`) 还会额外设置基于文件 mtime + size 计算的 `ETag`,JSON 路由 (registry/preset/namespaces/health/metrics) 不带 ETag。

### 压缩

响应会根据客户端的 `Accept-Encoding` 头自动使用 `gzip`、`deflate` 或 `br` (Brotli) 编码进行压缩。

### 速率限制

服务器限制每个客户端 IP 每分钟最多 **1200 次请求**。超出限制时:

```
HTTP/1.1 429 Too Many Requests
Retry-After: 60
```

```json
{
  "code": "RATE_LIMIT_EXCEEDED",
  "message": "Rate limit exceeded. Try again in Xs"
}
```

::: tip 反向代理配置
在反向代理（如 Nginx）后部署时, 需确保正确透传 `X-Forwarded-For`, 否则所有请求会被视为同一 IP 而共享配额。
:::

## 备份策略

### 备份内容

需要备份的内容:

1. **存储目录** - 所有 Registry 文件
2. **配置文件** - `auth.json`, `webhooks.json`, `.env`
3. **日志文件** - 用于审计和问题排查

### 备份与恢复

通过常规 `tar` + `cron` 把上述目录与文件归档到对象存储或备份盘即可, Rack 不绑定特定的备份方案。恢复时停止服务、解包、重启即可。

## 监控告警

服务无内置告警系统, 推荐基于 `/health` 探针 (服务存活) 与 Prometheus 指标 (内存、CPU、p99 延迟、事件循环延迟) 在 Alertmanager 或现有监控平台中配置阈值。
