import { Bot } from 'grammy'
import { Hono } from 'hono'
import type { Env } from './env'
import { isBearerAuthorized } from './security'

const admin = new Hono<{ Bindings: Env }>()

admin.use('*', async (c, next) => {
  if (!c.env.ADMIN_TOKEN) {
    return c.json({ error: 'ADMIN_TOKEN is not configured' }, 503)
  }

  if (!isBearerAuthorized(c.req.header('Authorization') ?? null, c.env.ADMIN_TOKEN)) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await next()
})

admin.get('/status', (c) => {
  return c.json({
    bot_token_configured: Boolean(c.env.BOT_TOKEN),
    webhook_secret_configured: Boolean(c.env.TELEGRAM_WEBHOOK_SECRET),
    database_configured: Boolean(c.env.DB),
  })
})

admin.post('/webhook', async (c) => {
  if (!c.env.BOT_TOKEN || !c.env.TELEGRAM_WEBHOOK_SECRET) {
    return c.json({ error: 'BOT_TOKEN or TELEGRAM_WEBHOOK_SECRET is not configured' }, 503)
  }

  const webhookUrl = `${new URL(c.req.url).origin}/webhook`
  const bot = new Bot(c.env.BOT_TOKEN)
  await bot.api.setWebhook(webhookUrl, {
    secret_token: c.env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ['message'],
  })

  return c.json({ success: true, webhook_url: webhookUrl })
})

export default admin
