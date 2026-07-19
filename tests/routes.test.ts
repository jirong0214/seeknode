import { describe, expect, it } from 'vitest'
import { app } from '../src/index'
import type { Env } from '../src/env'

const env = {
  BOT_TOKEN: 'bot-token',
  TELEGRAM_WEBHOOK_SECRET: 'telegram-secret',
  ADMIN_TOKEN: 'admin-secret',
  DB: {} as D1Database,
} satisfies Env

describe('production routes', () => {
  it('does not expose manual monitor execution routes', async () => {
    expect((await app.request('/monitor/check', {}, env)).status).toBe(404)
    expect((await app.request('/monitor/push', {}, env)).status).toBe(404)
    expect((await app.request('/monitor/cleanup', {}, env)).status).toBe(404)
  })

  it('protects admin routes with a Bearer token', async () => {
    expect((await app.request('/admin/status', {}, env)).status).toBe(401)

    const response = await app.request('/admin/status', {
      headers: { Authorization: 'Bearer admin-secret' },
    }, env)
    expect(response.status).toBe(200)
  })

  it('rejects webhook requests without the Telegram secret', async () => {
    expect((await app.request('/webhook', { method: 'POST' }, env)).status).toBe(401)
  })
})
