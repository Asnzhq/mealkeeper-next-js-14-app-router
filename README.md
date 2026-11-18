# MealKeeper 部署

## 本地开发

```bash
pnpm install
cp env.example .env
pnpm exec prisma generate
pnpm exec prisma migrate deploy
pnpm seed
pnpm dev
```

先启动 PostgreSQL，创建 `mealkeeper` 数据库，再填写 `.env` 的 `DATABASE_URL`。开发与部署使用同一个 `prisma/schema.prisma`，`prisma.config.ts` 指向 `prisma/postgres/migrations`。旧 SQLite 迁移留作历史记录。执行 `pnpm test` 与 `pnpm test:e2e` 前，创建独立的 PostgreSQL 测试库并设置 `TEST_DATABASE_URL`。测试会在该库内使用专用 schema。

## CloudBase 云托管与托管 PostgreSQL

1. 在可从云托管服务访问的网络内开通 PostgreSQL，创建空数据库 `mealkeeper` 和应用用户。托管数据库按服务要求开启 TLS。
2. 在云托管服务的环境变量中设置 `DATABASE_URL`、`NEXTAUTH_SECRET` 和公网 HTTPS 的 `NEXTAUTH_URL`。例如 `postgresql://USER:PASSWORD@HOST:5432/mealkeeper?schema=public&sslmode=require`。密码中的特殊字符需 URL 编码。应用和迁移应使用可直连的数据库地址。
3. 使用仓库根目录的 Dockerfile 发布新版本，端口为 3000。容器启动时执行 `prisma migrate deploy`。从能访问同一数据库的环境执行一次 `pnpm seed`，导入 52 道内置菜谱。
4. 验证登录、食材读写和菜谱列表，并配置数据库备份。封面 URL 随数据库持久化；上传文件用对象存储或独立持久卷保存。

换库会创建新表，现有 SQLite 试运行数据不会自动转入 PostgreSQL。需要保留试用数据时，切换前先从试用实例导出；应用内导出覆盖食材、流水和计划。

## Docker Compose 部署

准备域名 DNS A/AAAA 记录指向服务器，复制 `env.example` 到 `.env`，并设置至少 `POSTGRES_PASSWORD`、`NEXTAUTH_SECRET`、`NEXTAUTH_URL=https://meal.example.com`。生成密钥可使用 `openssl rand -base64 32`。启动：

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

`pnpm analyze` 执行生产构建并写出 `.next/analyze/client.html`、服务端报告与 `.next/analyze/gzip-report.json`。gzip 报告列出所有客户端 chunk 的压缩大小和最大 chunk；Next App Router 默认按 route 分包。菜谱封面从存储地址延迟加载，空地址和加载失败时显示占位图。食材列表超过 100 项时使用虚拟滚动。

## 纯本地模式

账户页的“纯本地模式”会限制浏览器 CSP 到当前源、屏蔽远端图片优化请求，并关闭 AI、短信验证码和 Web Push；上传改用本地磁盘。AI/API 密钥只能配置在服务器环境变量。该模式不拦截用户主动离开站点打开外部链接。
