# 使用说明

## Telegram 命令

- `/start`：初始化或重新激活当前用户。
- `/help`：显示帮助。
- `/info`：显示 Bot 与订阅规则说明。
- `/add 关键词1 [关键词2] [关键词3]`：新增关键词组合订阅。
- `/list`：列出当前订阅。
- `/del <订阅ID>`：停用指定订阅。
- `/status`：显示当前用户状态。

同一条订阅中的多个关键词采用 AND 匹配；一条帖子必须同时包含全部关键词才会推送。同一用户对同一帖子最多收到一次通知。

## HTTP 路由

- `GET /`：公开健康检查，不访问 D1。
- `POST /webhook`：Telegram Webhook，必须携带 Telegram secret header。
- `GET /admin/status`：受 Bearer Token 保护的配置状态。
- `POST /admin/webhook`：受 Bearer Token 保护的 Webhook 设置接口。

没有公网监控执行接口。RSS 抓取、推送和数据清理由 Worker Cron 直接执行。
