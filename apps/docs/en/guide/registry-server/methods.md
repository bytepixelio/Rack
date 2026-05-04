---
aside: false
---

# Deployment Methods

Registry Server supports multiple deployment methods. You can choose the most suitable solution based on your actual needs.

## Method Comparison

| Deployment Method | Use Case                   | Advantages                      |
| ----------------- | -------------------------- | ------------------------------- |
| Local Development | Development and testing    | Quick start, easy to debug      |
| PM2               | Small production           | Simple to use, process manager  |
| Docker            | Medium to large production | Good isolation, easy to migrate |

## Local Development Deployment

Suitable for development and quick testing scenarios.

### Development Mode

```bash
# Navigate to project directory
cd apps/registry-server

# Start development server (watch mode)
pnpm dev
```

Development mode automatically watches for code changes and restarts the service.

### Production Mode

```bash
# Build project
pnpm build

# Start production server
pnpm start
```

::: warning Not Recommended for Production
Running locally directly lacks process supervision and auto-restart capabilities, only suitable for development and testing.
:::

## PM2 Deployment

PM2 is a powerful Node.js process manager, suitable for single-server production deployment.

### Install PM2

```bash
# Install PM2 globally
npm install -g pm2
```

### Method 1: Direct Start

```bash
# Build project
pnpm --filter @rack/registry-server build

# Start with PM2
cd apps/registry-server
pm2 start dist/server.js --name registry-server

# Check status
pm2 status

# View logs
pm2 logs registry-server

# Stop service
pm2 stop registry-server

# Restart service
pm2 restart registry-server
```

### Method 2: Using Configuration File (Recommended)

Create PM2 configuration file `apps/registry-server/ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: 'registry-server',
      script: './dist/server.js',
      instances: 2, // Number of instances (utilize multi-core CPU)
      exec_mode: 'cluster', // Cluster mode
      env: {
        NODE_ENV: 'production',
        PORT: 8080,
        HOST: '0.0.0.0'
      },
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true, // Auto restart
      max_memory_restart: '1G', // Auto restart when memory exceeds 1G
      watch: false // Disable file watching in production
    }
  ]
}
```

::: warning Cluster Mode and Webhooks

The Webhook service uses an **in-memory queue**. In cluster mode, each Worker process maintains its own independent queue. This means a single upload event will trigger Webhooks once per Worker — causing duplicate notifications.

If you use Webhooks, set `instances: 1` or use fork mode (`exec_mode: 'fork'`) to avoid this:

```javascript
{
  instances: 1,
  exec_mode: 'fork'
}
```

:::

Start using configuration file:

```bash
# Start service
pm2 start ecosystem.config.js

# Reload configuration
pm2 reload ecosystem.config.js

# Delete application
pm2 delete registry-server
```

### Auto-start on Boot

Run `pm2 save && pm2 startup` and follow the command PM2 prints (usually requires `sudo`). For day-to-day operations (`pm2 list / show / logs / monit / flush / restart all`), see the [PM2 docs](https://pm2.keymetrics.io/docs/usage/quick-start/).

## Docker Deployment

The repo ships with an official [`apps/registry-server/Dockerfile`](https://github.com/bytepixelio/Rack/blob/main/apps/registry-server/Dockerfile) and [`apps/registry-server/docker-compose.yml`](https://github.com/bytepixelio/Rack/blob/main/apps/registry-server/docker-compose.yml) — use them directly, no need to roll your own.

### Quick start

```bash
cd apps/registry-server

# Start (host port defaults to 18080; container always listens on 8080)
docker compose up -d

# View logs
docker compose logs -f

# Rebuild after code or Dockerfile changes
docker compose up -d --build

# Stop
docker compose down
```

Override the host port with `HOST_PORT`, e.g. `HOST_PORT=18090 docker compose up -d`. The container port is hardcoded to `8080`; if you change it, update the image's `HEALTHCHECK` to match.

### Volumes & config

| Mount point                 | Purpose                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------ |
| `/data`                     | Uploaded tar.gz packages, per-registry `versions.json`, and the `.healthcheck` marker (must persist) |
| `/app/config/auth.json`     | Namespace/token policy, bind-mounted from repo-root `config/auth.json` so the Server and Worker share one source of truth |
| `/app/config/webhooks.json` | Webhook config, mounted from `apps/registry-server/config/webhooks.json`             |

JSON Schemas live at `/app/schema` **inside the image** — not on a volume — so `docker compose up -d --build` is enough to roll out schema changes.

### Switching to the R2 backend

To send uploaded packages to Cloudflare R2 instead of local disk, put the following in `apps/registry-server/.env.r2.local` (already gitignored):

```env
STORAGE_BACKEND=r2
R2_BUCKET_NAME=...
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
ADMIN_TOKEN=...
HOST_PORT=18081
```

Then start it with its own project name (can run alongside the local-mode instance):

```bash
docker compose --env-file .env.r2.local -p rack-r2 up -d
```

For the full table of volumes / env vars / parallel-mode notes, see the Docker section in [`apps/registry-server/README.md`](https://github.com/bytepixelio/Rack/blob/main/apps/registry-server/README.md).

### Manual build / run (without compose)

```bash
# Must build from the repo root (the Dockerfile needs packages/auth-core + schema files from the root)
docker build -f apps/registry-server/Dockerfile -t rack-registry .

# Default run
docker run -p 18080:8080 rack-registry

# Persistent storage + custom auth + admin token
docker run -p 18080:8080 \
  -v $(pwd)/config/auth.json:/app/config/auth.json:ro \
  -v registry-data:/data \
  -e ADMIN_TOKEN=your-secret \
  rack-registry
```

## Nginx Reverse Proxy

In production environments, Nginx is typically used as a reverse proxy to provide HTTPS support and load balancing.

### Install Nginx

```bash
# Ubuntu/Debian
sudo apt-get install -y nginx

# CentOS/RHEL
sudo yum install -y nginx
```

### Configure Nginx

Create configuration file `/etc/nginx/sites-available/registry`:

```nginx
upstream registry_backend {
    # If using PM2 cluster mode, can configure multiple backends
    server 127.0.0.1:8080;
    # server 127.0.0.1:8081;
    # server 127.0.0.1:8082;
}

server {
    listen 80;
    server_name registry.example.com;

    # Force HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name registry.example.com;

    # SSL certificate configuration
    ssl_certificate /etc/nginx/ssl/registry.crt;
    ssl_certificate_key /etc/nginx/ssl/registry.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Logging
    access_log /var/log/nginx/registry-access.log;
    error_log /var/log/nginx/registry-error.log;

    # Upload size limit (Registry packages can be large)
    client_max_body_size 100M;

    # Proxy configuration
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

        # Timeout configuration
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Cache static resources
    location ~* \.(json|js|css|png|jpg|jpeg|gif|ico)$ {
        proxy_pass http://registry_backend;
        proxy_cache_valid 200 1h;
        add_header Cache-Control "public, max-age=3600";
    }

    # Health check
    location /health {
        proxy_pass http://registry_backend;
        access_log off;
    }
}
```

Enable configuration:

```bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/registry /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

### Obtain SSL Certificate

Using Let's Encrypt free certificate:

```bash
# Install Certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d registry.example.com

# Auto renewal (Certbot automatically sets up cron job)
sudo certbot renew --dry-run
```
