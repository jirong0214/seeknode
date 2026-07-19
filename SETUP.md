# 部署与迁移

## 1. 数据库选择

如果旧 D1 中已经积累了数十万条 `is_push = 0` 记录，推荐新建数据库。旧库创建复合索引本身会产生大量一次性读写，在 Free 套餐上可能无法在一天内完成。

新建数据库：

```bash
npx wrangler d1 create seeknode
```

把返回的 `database_id` 填入 `wrangler.jsonc`，然后应用迁移：

```bash
npx wrangler d1 migrations apply seeknode --remote
```

保留旧数据库时，先备份，再应用 `0002_optimize_d1.sql`。迁移不会批量更新或删除旧数据；新索引建立后，队列会每次处理 50 条旧记录。

## 2. 配置密钥

生成两个独立的随机密钥，例如：

```bash
openssl rand -hex 32
```

配置 Worker secrets：

```bash
npx wrangler secret put BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put ADMIN_TOKEN
```

- `BOT_TOKEN`：从 BotFather 获取。
- `TELEGRAM_WEBHOOK_SECRET`：Telegram 调用 `/webhook` 时携带的校验密钥。
- `ADMIN_TOKEN`：调用 `/admin/*` 时使用；必须和 Webhook secret 不同。

不要把这些值写入 `wrangler.jsonc` 或提交到 Git。

## 3. 部署 Worker

```bash
corepack pnpm install
corepack pnpm typecheck
corepack pnpm test
npx wrangler deploy
```

部署配置包含两个 Cron：

- `*/5 * * * *`：每 5 分钟抓取 RSS 并处理推送。
- `17 3 * * *`：每天 UTC 03:17 分批清理 90 天前的数据。

不要再配置外部定时服务调用 HTTP 路由。

## 4. 设置 Telegram Webhook

```bash
curl -X POST "https://<worker-domain>/admin/webhook" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

接口会把 Telegram Webhook 设置为当前域名的 `/webhook`，同时注册 `TELEGRAM_WEBHOOK_SECRET`。

检查受保护的配置状态：

```bash
curl "https://<worker-domain>/admin/status" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

## 5. 观察 D1 使用量

```bash
npx wrangler d1 insights seeknode \
  --sort-type=sum \
  --sort-by=reads \
  --sort-direction=DESC \
  --limit=10 \
  --timePeriod=1d
```

正常情况下，待处理查询每次最多返回 50 条，不应再随 `posts` 表总行数增长。
