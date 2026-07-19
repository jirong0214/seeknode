import { webhookCallback } from 'grammy'
import { Hono } from 'hono'
import admin from './admin'
import { createBotWithCommands } from './bot-commands'
import type { Env } from './env'
import { cleanupExpiredData, runMonitor } from './monitor'
import { constantTimeEqual } from './security'

const MONITOR_CRON = '*/5 * * * *'
const CLEANUP_CRON = '17 3 * * *'

export const app = new Hono<{ Bindings: Env }>()

app.get('/', (c) => c.json({ status: 'ok', service: 'seeknode' }))
app.route('/admin', admin)

app.post('/webhook', async (c) => {
  if (!c.env.BOT_TOKEN || !c.env.TELEGRAM_WEBHOOK_SECRET || !c.env.DB) {
    return c.json({ error: 'Service is not configured' }, 503)
  }

  const telegramSecret = c.req.header('X-Telegram-Bot-Api-Secret-Token') ?? null
  if (!constantTimeEqual(telegramSecret, c.env.TELEGRAM_WEBHOOK_SECRET)) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  try {
    const bot = createBotWithCommands(c.env.BOT_TOKEN, c.env.DB)
    return await webhookCallback(bot, 'hono')(c)
  } catch (error) {
    console.error('Telegram webhook failed:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledController, env: Env): Promise<void> {
    if (event.cron === MONITOR_CRON) {
      console.log('RSS monitor completed:', await runMonitor(env))
      return
    }

    if (event.cron === CLEANUP_CRON) {
      console.log('Retention cleanup completed:', await cleanupExpiredData(env.DB))
      return
    }

    console.warn('Ignoring unknown cron trigger:', event.cron)
  },
}
