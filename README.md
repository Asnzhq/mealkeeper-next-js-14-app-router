# MealKeeper 部署

## 本地开发

```bash
pnpm install
cp .env.example .env
pnpm exec prisma migrate dev
pnpm seed
pnpm dev
```

开发默认使用 SQLite。`prisma/schema.prisma` 与 SQLite 迁移用于本地开发；容器构建使用 `prisma/postgres/schema.prisma` 和独立的 PostgreSQL 初始迁移。两份 schema 保持同一组模型，可通过 `pnpm db:prepare-postgres` 重新生成 PG schema 和初始迁移。

## Docker Compose 部署

准备域名 DNS A/AAAA 记录指向服务器，复制 `.env.example` 到 `.env`，并设置至少 `POSTGRES_PASSWORD`、`NEXTAUTH_SECRET`、`NEXTAUTH_URL=https://meal.example.com`。生成密钥可使用 `openssl rand -base64 32`。启动：

```bash
docker compose up -d --build
```

PostgreSQL 仅在 Compose 网络内可见，Next.js 绑定到主机 `127.0.0.1:3000`。需要对象存储时以 `docker compose --profile storage up -d` 启动可选 MinIO，并设置对象存储变量。生产可使用托管 OSS/COS/R2，密钥只存放在服务端环境变量中。

### Nginx 反向代理与 HTTPS

使用 Certbot / Let's Encrypt 为域名签发证书后，将 HTTP 重定向至 HTTPS。示例站点配置：

```nginx
server {
    listen 443 ssl http2;
    server_name meal.example.com;
    ssl_certificate /etc/letsencrypt/live/meal.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/meal.example.com/privkey.pem;
    client_max_body_size 9m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
server { listen 80; server_name meal.example.com; return 301 https://$host$request_uri; }
```

将证书续期加入 Certbot 定时任务并执行 `nginx -t && systemctl reload nginx`。CSP、鉴权和 API 限流由应用层提供。

### 每日备份与恢复

`scripts/backup-postgres.sh` 通过 `pg_dump` 导出 gzip 文件，并删除超过 30 天的本地备份。加入每日 cron（建议凌晨 02:30）：

```cron
30 2 * * * cd /srv/mealkeeper && POSTGRES_USER=mealkeeper POSTGRES_DB=mealkeeper ./scripts/backup-postgres.sh >> /var/log/mealkeeper-backup.log 2>&1
```

将 `BACKUP_DIR` 指向受限权限目录，并定期把备份复制到异机或对象存储；部署目录与备份介质不要放在同一块磁盘。恢复示例：

```bash
gzip -dc backups/mealkeeper-YYYY-MM-DDTHH-MM-SSZ.sql.gz | docker compose exec -T postgres psql -U mealkeeper -d mealkeeper
```

## 性能报告

`pnpm analyze` 执行生产构建并写出 `.next/analyze/client.html`、服务端报告与 `.next/analyze/gzip-report.json`。gzip 报告列出所有客户端 chunk 的压缩大小和最大 chunk；Next App Router 默认按 route 分包，图片经 `next/image` 延迟加载并输出 AVIF/WebP。食材列表超过 100 项时使用虚拟滚动。

## 纯本地模式

账户页的“纯本地模式”会限制浏览器 CSP 到当前源、屏蔽远端图片优化请求，并关闭 AI、短信验证码和 Web Push；上传改用本地磁盘。AI/API 密钥只能配置在服务器环境变量。该模式不拦截用户主动离开站点打开外部链接。
