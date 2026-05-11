---
aside: false
---

# 部署方式

Registry Server 支持多种部署方式, 你可以根据实际需求选择最合适的方案。

## 方式对比

| 部署方式 | 适用场景       | 优点               |
| -------- | -------------- | ------------------ |
| 本地开发 | 开发测试       | 快速启动, 便于调试 |
| PM2      | 小型生产部署   | 简单易用, 进程管理 |
| Docker   | 中大型生产部署 | 隔离性好, 易于迁移 |

## 本地开发部署

适合开发和快速测试场景。

### 开发模式启动

```bash
# 进入项目目录
cd apps/registry-server

# 启动开发服务器 (watch 模式)
pnpm dev
```

开发模式会自动监听代码变化并重启服务。

### 生产模式启动

```bash
# 构建项目
pnpm build

# 启动生产服务器
pnpm start
```

::: warning 不推荐用于生产
本地直接运行不具备进程守护、自动重启等能力, 仅适合开发测试。
:::

## PM2 部署

PM2 是一个强大的 Node.js 进程管理器, 适合单机生产部署。

### 安装 PM2

```bash
# 全局安装 PM2
npm install -g pm2
```

### 方式 1: 直接启动

```bash
# 构建项目
pnpm --filter @rack/registry-server build

# 使用 PM2 启动
cd apps/registry-server
pm2 start dist/server.js --name registry-server

# 查看状态
pm2 status

# 查看日志
pm2 logs registry-server

# 停止服务
pm2 stop registry-server

# 重启服务
pm2 restart registry-server
```

### 方式 2: 使用配置文件 (推荐)

创建 PM2 配置文件 `apps/registry-server/ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: 'registry-server',
      script: './dist/server.js',
      instances: 2, // 启动实例数 (利用多核 CPU)
      exec_mode: 'cluster', // 集群模式
      env: {
        NODE_ENV: 'production',
        PORT: 8080,
        HOST: '0.0.0.0'
      },
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true, // 自动重启
      max_memory_restart: '1G', // 内存超过 1G 自动重启
      watch: false // 生产环境不启用文件监听
    }
  ]
}
```

::: warning 集群模式与 Webhook

Webhook 服务使用**纯内存队列**。在集群模式下，每个 Worker 进程各自维护独立的队列，因此一次上传事件会被每个 Worker 各触发一次，造成重复通知。

如果你使用 Webhook，请将 `instances` 设为 `1` 或使用 fork 模式（`exec_mode: 'fork'`）以避免此问题：

```javascript
{
  instances: 1,
  exec_mode: 'fork'
}
```

:::

使用配置文件启动:

```bash
# 启动服务
pm2 start ecosystem.config.js

# 重新加载配置
pm2 reload ecosystem.config.js

# 删除应用
pm2 delete registry-server
```

### 开机自启动

执行 `pm2 save && pm2 startup`, 按 PM2 提示执行返回的命令 (通常需要 `sudo`)。其它日常运维命令 (`pm2 list / show / logs / monit / flush / restart all`) 参见 [PM2 官方文档](https://pm2.keymetrics.io/docs/usage/quick-start/)。

## Docker 部署

仓库已提供官方 [`apps/registry-server/Dockerfile`](https://github.com/bytepixelio/Rack/blob/main/apps/registry-server/Dockerfile) 和 [`apps/registry-server/docker-compose.yml`](https://github.com/bytepixelio/Rack/blob/main/apps/registry-server/docker-compose.yml), 直接复用即可, 不需要自己写。

### 快速启动

```bash
cd apps/registry-server

# 启动 (宿主端口默认 18080, 容器内固定 8080)
docker compose up -d

# 查看日志
docker compose logs -f

# 修改代码或 Dockerfile 后重建
docker compose up -d --build

# 停止
docker compose down
```

宿主端口可通过 `HOST_PORT` 覆盖, 例如 `HOST_PORT=18090 docker compose up -d`。容器内端口固定 `8080`,如需修改要同步更新镜像中的 `HEALTHCHECK`。

### 关键卷与配置

| 挂载点                      | 用途                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `/data`                     | 上传的 tar.gz 包、各 Registry 的 `versions.json`、`.healthcheck` 标记 (需要持久化)  |
| `/app/config/auth.json`     | 命名空间/Token 策略, 默认从仓库根 `config/auth.json` 绑定挂载, 与 Worker 共享同一份 |
| `/app/config/webhooks.json` | Webhook 配置, 默认从 `apps/registry-server/config/webhooks.json` 挂载               |

JSON Schema 在镜像里 `/app/schema` 路径下, **不**走外部卷, 改 schema 用 `docker compose up -d --build` 即可。

### 切换到 R2 后端

需要把上传后的包落到 Cloudflare R2 时, 在 `apps/registry-server/.env.r2.local`(已经在 gitignore 里) 里写:

```env
STORAGE_BACKEND=r2
R2_BUCKET_NAME=...
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
ADMIN_TOKEN=...
HOST_PORT=18081
```

然后用独立 project 名启动 (可与 local 模式实例并存):

```bash
docker compose --env-file .env.r2.local -p rack-r2 up -d
```

更详细的卷、env 变量、并行运行说明见 [`apps/registry-server/README.md`](https://github.com/bytepixelio/Rack/blob/main/apps/registry-server/README.md) 的 Docker 章节。

### 手动 build / run (不用 compose)

```bash
# 必须在仓库根目录构建 (Dockerfile 需要从根访问 packages/auth-core 和 schema)
docker build -f apps/registry-server/Dockerfile -t rack-registry .

# 默认运行
docker run -p 18080:8080 rack-registry

# 持久化存储 + 自定义 auth + admin token
docker run -p 18080:8080 \
  -v $(pwd)/config/auth.json:/app/config/auth.json:ro \
  -v registry-data:/data \
  -e ADMIN_TOKEN=your-secret \
  rack-registry
```

## Nginx 反向代理

在生产环境中, 通常使用 Nginx 作为反向代理, 提供 HTTPS 支持和负载均衡。

### 安装 Nginx

```bash
# Ubuntu/Debian
sudo apt-get install -y nginx

# CentOS/RHEL
sudo yum install -y nginx
```

### 配置 Nginx

创建配置文件 `/etc/nginx/sites-available/registry`:

```nginx
upstream registry_backend {
    # 如果使用 PM2 集群模式, 可以配置多个后端
    server 127.0.0.1:8080;
    # server 127.0.0.1:8081;
    # server 127.0.0.1:8082;
}

server {
    listen 80;
    server_name registry.example.com;

    # 强制 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name registry.example.com;

    # SSL 证书配置
    ssl_certificate /etc/nginx/ssl/registry.crt;
    ssl_certificate_key /etc/nginx/ssl/registry.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # 日志
    access_log /var/log/nginx/registry-access.log;
    error_log /var/log/nginx/registry-error.log;

    # 上传大小限制 (Registry 包可能较大)
    client_max_body_size 100M;

    # 代理配置
    location / {
        proxy_pass http://registry_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # 超时配置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 缓存静态资源
    location ~* \.(json|js|css|png|jpg|jpeg|gif|ico)$ {
        proxy_pass http://registry_backend;
        proxy_cache_valid 200 1h;
        add_header Cache-Control "public, max-age=3600";
    }

    # 健康检查
    location /health {
        proxy_pass http://registry_backend;
        access_log off;
    }
}
```

启用配置:

```bash
# 创建软链接
sudo ln -s /etc/nginx/sites-available/registry /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx
```

### 获取 SSL 证书

使用 Let's Encrypt 免费证书:

```bash
# 安装 Certbot
sudo apt-get install -y certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d registry.example.com

# 自动续期 (Certbot 会自动设置 cron 任务)
sudo certbot renew --dry-run
```
