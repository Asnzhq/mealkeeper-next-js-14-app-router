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

本地默认使用 `file:./dev.db`，文件位于 `prisma/dev.db`。新数据库使用上述迁移命令初始化；已有本地开发库可执行 `pnpm exec prisma db push` 同步 schema。测试使用独立 SQLite 文件，不需要数据库服务。之前的 PostgreSQL 迁移保留在 `prisma/postgres/`，当前运行不使用该目录。

## CloudBase 云托管试运行

使用仓库根目录的 Dockerfile，端口设为 3000，最多运行一个副本。镜像内含全新 SQLite 和 52 道内置菜谱。容器首次启动时初始化数据库，有已有数据文件时只应用待执行迁移。`DATABASE_URL` 默认是 `file:/app/data/mealkeeper.sqlite`。

云托管未挂载持久存储时，容器重建或版本替换可能重置试用数据。重新部署前可在应用内导出食材、流水和计划。上传图片需使用对象存储或持久卷才能跨容器保留。

## Docker Compose 部署

准备域名 DNS A/AAAA 记录指向服务器，复制 `env.example` 到 `.env`，并设置 `NEXTAUTH_SECRET` 和 `NEXTAUTH_URL=https://meal.example.com`。生成密钥可使用 `openssl rand -base64 32`。启动：

```bash
docker compose up -d --build
```

SQLite 和本地上传分别保存在 `sqlite-data` 与 `uploads` 卷中，Next.js 绑定到主机 `127.0.0.1:3000`。需要对象存储时以 `docker compose --profile storage up -d` 启动可选 MinIO，并设置对象存储变量。生产可使用托管 OSS/COS/R2，密钥只存放在服务端环境变量中。

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

### SQLite 备份

停止应用后复制数据目录，避免拷贝时有数据库写入。备份可能包含账户数据和本地会话密钥，应只保存在受限目录。

```bash
mkdir -p backups
docker compose stop app
docker compose cp app:/app/data "./backups/mealkeeper-$(date +%F)"
docker compose start app
```

## 性能报告

`pnpm analyze` 执行生产构建并写出 `.next/analyze/client.html`、服务端报告与 `.next/analyze/gzip-report.json`。gzip 报告列出所有客户端 chunk 的压缩大小和最大 chunk；Next App Router 默认按 route 分包。菜谱封面从存储地址延迟加载，空地址和加载失败时显示占位图。食材列表超过 100 项时使用虚拟滚动。

## 纯本地模式

账户页的“纯本地模式”会限制浏览器 CSP 到当前源、屏蔽远端图片优化请求，并关闭 AI、短信验证码和 Web Push；上传改用本地磁盘。AI/API 密钥只能配置在服务器环境变量。该模式不拦截用户主动离开站点打开外部链接。
