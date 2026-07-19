# SeekNode

SeekNode 是运行在 Cloudflare Workers 上的 NodeSeek RSS 关键词订阅 Telegram Bot。

本仓库针对 D1 免费套餐进行了重新设计：RSS 抓取每 5 分钟执行一次，只读取有界的待处理队列；活跃订阅通过一次 JOIN 加载；历史数据按 90 天保留并分批清理。管理任务不暴露公网执行入口。

## 运行架构

```text
Telegram ──POST /webhook──> 命令处理 ──> D1

Worker Cron (每 5 分钟)
  └─> 抓取 RSS
      └─> 写入新帖子
          └─> 读取最多 50 条待处理帖子
              └─> 匹配活跃订阅并推送

Worker Cron (每天一次)
  └─> 分批删除 90 天前的帖子和推送日志
```

## 安全边界

- `/webhook` 只接受带正确 `X-Telegram-Bot-Api-Secret-Token` 的 Telegram 请求。
- `/admin/*` 要求 `Authorization: Bearer <ADMIN_TOKEN>`。
- 不提供 `/monitor/check`、`/monitor/push`、`/monitor/cleanup` 或 `/debug` 公网入口。
- 定时任务仅由 Cloudflare Worker Cron 在内部调用。

## D1 优化

- `posts(is_push, created_at)`：按时间读取最多 50 条待处理帖子，避免全表扫描。
- `keywords_sub(is_active, user_id)`：一次 JOIN 获取全部活跃订阅，消除 N+1 查询。
- `push_logs(chat_id, post_id)` 唯一索引：推送前先预留记录，避免重复通知。
- 新帖子按 `post_id` 批量检查和写入。
- 无用户、无订阅和无关键词匹配时也会完成帖子状态。
- 清理任务每次每表最多删除 1,000 条，控制 D1 写入峰值。

个人规模使用时，预期读取量通常为每天数万到数十万行，显著低于 D1 Free 每天 500 万行额度。实际用量取决于 RSS 条目数、用户数和订阅数，请使用 `wrangler d1 insights` 持续观察。

## 部署

完整步骤见 [SETUP.md](SETUP.md)。核心命令：

```bash
corepack pnpm install
npx wrangler d1 migrations apply seeknode --remote
npx wrangler secret put BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put ADMIN_TOKEN
npx wrangler deploy
```

部署后，用管理密钥设置 Telegram Webhook：

```bash
curl -X POST "https://<worker-domain>/admin/webhook" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

## 开发验证

```bash
corepack pnpm typecheck
corepack pnpm test
npx wrangler deploy --dry-run
```
