# Server

服务端数据访问、Prisma 操作及服务端业务编排放置于此。

## 账号、家庭与同步

- 认证使用 Auth.js Credentials。邮箱密码方案使用 Node `scrypt` 哈希并由 JWT 会话签名；手机号验证码通过 `SMS_GATEWAY_URL` 适配现有短信服务。开发环境在验证码接口响应中返回一次性测试码。
- 配置 `NEXTAUTH_SECRET`（随机 32 字节以上）和 `NEXTAUTH_URL`。生产环境只允许完成家庭设置的已登录用户读写家庭 API。
- 首位成员创建家庭，其他成员使用邀请码加入。家庭食材、菜谱和计划根据 `family_id` 隔离；每次库存流水保存 `operator_id`。
- 家庭库存用 React Query 每 4 秒轮询。数据由 PostgreSQL 持久化，轮询不要求额外进程或平台连接升级。
- 首次部署使用 `pnpm prisma migrate deploy`。已有 `db push` 数据库应先备份，再按 Prisma 的 baseline 流程标记已应用迁移后部署新迁移；不要直接把无家庭归属的数据批量挂到任意家庭。

## PWA 推送

- 生成 VAPID 密钥：`pnpm exec web-push generate-vapid-keys`，写入 `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY` 和 `VAPID_SUBJECT`。
- 配置 `CRON_SECRET`，由托管平台每天 07:30（Asia/Shanghai）调用 `POST /api/notifications/dispatch`，请求头为 `Authorization: Bearer $CRON_SECRET`。接口同时派发当天到期提醒；`NotificationDispatch.dedupe_key` 保证同一天只发一次。
- 没有浏览器推送订阅时，通知会写入应用内消息中心。iOS 用户需从 Safari 将 MealKeeper 添加到主屏幕后再开启推送。
