---
aside: false
---

# Operations and Monitoring

Ensure Registry Server runs stably with health checks, monitoring metrics, and log management tools.

## Health Checks

Registry Server provides a `/health` endpoint for health checking.

### Basic Health Check

```bash
curl http://localhost:8080/health
```

**Healthy Response (200 OK)**

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

**Unhealthy Response (503 Service Unavailable)**

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

### Using in Load Balancers

**Nginx**

```nginx
upstream registry_backend {
    server 127.0.0.1:8080;
    server 127.0.0.1:8081;

    # Health check
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

## Prometheus Monitoring

Registry Server exposes a `/metrics` endpoint providing monitoring metrics in Prometheus format.

### Metrics Endpoint

```bash
curl http://localhost:8080/metrics
```

**Example Response**

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

### Available Metrics

**Process Metrics**

- `process_cpu_user_seconds_total` - CPU user time
- `process_cpu_system_seconds_total` - CPU system time
- `process_resident_memory_bytes` - Resident memory
- `process_open_fds` - Open file descriptors

**Node.js Metrics**

- `nodejs_heap_size_total_bytes` - Total heap size
- `nodejs_heap_size_used_bytes` - Used heap size
- `nodejs_eventloop_lag_seconds` - Event loop lag
- `nodejs_gc_duration_seconds` - GC duration

**HTTP Request Metrics**

- `http_request_duration_seconds` - HTTP request duration histogram
  - Labels: `method`, `route`, `status_code`
  - Buckets: 1ms, 5ms, 10ms, 50ms, 100ms, 500ms, 1s, 5s, 10s

### Configure Prometheus

Add scrape job to `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'registry-server'
    static_configs:
      - targets: ['localhost:8080']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

Start Prometheus:

```bash
# Using Docker
docker run -d \
  --name prometheus \
  -p 9090:9090 \
  -v $(pwd)/prometheus.yml:/etc/prometheus/prometheus.yml \
  prom/prometheus

# Access Prometheus UI
open http://localhost:9090
```

### Grafana Dashboard

After adding Prometheus as a Grafana data source, build dashboards from the metrics listed above. Common PromQL expressions:

```
# Resident memory (MB)
process_resident_memory_bytes / 1024 / 1024
# CPU usage
rate(process_cpu_user_seconds_total[5m])
# Heap memory usage
nodejs_heap_size_used_bytes / nodejs_heap_size_total_bytes * 100
# Event loop lag
nodejs_eventloop_lag_seconds
# HTTP request rate
rate(http_request_duration_seconds_count[5m])
# HTTP request duration (p99)
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))
```

## Log Management

### Log Levels

Configure log level via `LOG_LEVEL` environment variable:

```bash
# Options: trace, debug, info, warn, error, fatal
LOG_LEVEL=info
```

**Level Description**

| Level   | Description                         | Use Case             |
| ------- | ----------------------------------- | -------------------- |
| `trace` | Most detailed logs, all information | Deep debugging       |
| `debug` | Debug information                   | Development          |
| `info`  | General information (default)       | Production           |
| `warn`  | Warning messages                    | Production           |
| `error` | Error messages                      | Production           |
| `fatal` | Fatal errors                        | Critical issues only |

### Sensitive Header Redaction

Request logs automatically redact the following headers (replaced with `[REDACTED]` unless log level is `debug` or `trace`):

- `authorization`
- `cookie` / `set-cookie`
- `x-registry-token`
- `proxy-authorization`

### Log Format

Registry Server uses structured logging (JSON format in production, pretty-printed in development):

**Production (JSON)**

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

**Development (Pretty)**

```
[10:30:00 +0800] INFO: Server listening {"port": 8080}
```

### Log Output

The server writes logs to stdout / stderr; how they land on disk depends on how it's deployed:

- **PM2**: by default `~/.pm2/logs/registry-server-{out,error}.log`; customise via `out_file` / `error_file` in `ecosystem.config.js`.
- **Docker**: view via `docker logs`, or mount a host directory to capture them on disk.

## Built-in Performance Features

The following performance features are always enabled and not configurable via environment variables:

### Response Caching

The server sets `Cache-Control` per resource type (tiers defined in `@rack/registry-core`'s `CACHE_HEADERS`):

| Tier        | Value                                 | Routes                                  |
| ----------- | ------------------------------------- | --------------------------------------- |
| `none`      | `no-store`                            | Error responses, `/health`              |
| `short`     | `public, max-age=60`                  | Listings, `latest`, `versions`          |
| `long`      | `public, max-age=86400`               | Schemas, presets                        |
| `immutable` | `public, max-age=31536000, immutable` | Versioned registries and template files |

Versioned content (`/registries/@ns/name/1.0.0/...`) is content-addressed — the URL's semantics cannot change over time, so it can be cached indefinitely. Listings and `latest` need to reflect new releases within ~60 seconds. Template-file download routes (`/registries/.../files/*`) additionally set an `ETag` derived from the file's mtime + size.

### Compression

Responses are automatically compressed using `gzip`, `deflate`, or `br` (Brotli) encoding based on the client's `Accept-Encoding` header.

### Rate Limiting

The server limits each client IP to **1200 requests per minute**. When the limit is exceeded:

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

::: tip Reverse Proxy Configuration
When deploying behind a reverse proxy (e.g., Nginx), ensure `X-Forwarded-For` is correctly forwarded so each real client IP is counted independently.
:::

## Backup Strategy

### Backup Content

Content to backup:

1. **Storage directory** - All registry files
2. **Configuration files** - `auth.json`, `webhooks.json`, `.env`
3. **Log files** - For auditing and troubleshooting

### Backup and Restore

Use a regular `tar` + `cron` job to archive the directories and files above to object storage or a backup disk — Rack does not prescribe a backup mechanism. To restore, stop the service, unpack, and restart.

## Monitoring Alerts

The service has no built-in alerting. We recommend defining thresholds in Alertmanager (or your existing monitoring platform) on top of the `/health` probe (liveness) and Prometheus metrics (memory, CPU, p99 latency, event-loop lag).
