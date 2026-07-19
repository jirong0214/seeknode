import { afterEach, describe, expect, it, vi } from 'vitest'
import { app } from '../src/index'
import type { Env } from '../src/env'

const env = {
  BOT_TOKEN: 'bot-token',
  TELEGRAM_WEBHOOK_SECRET: 'telegram-secret',
  ADMIN_TOKEN: 'admin-secret',
  DB: {} as D1Database,
} satisfies Env

describe('production routes', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

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

  it('passes an authenticated update through grammY', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      ok: true,
      result: {
        id: 123,
        is_bot: true,
        first_name: 'SeekNode Test',
        username: 'seeknode_test_bot',
      },
    })))

    const response = await app.request('/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'telegram-secret',
      },
      body: JSON.stringify({ update_id: 999999999 }),
    }, env)

    expect(response.status).toBe(200)
  })

})
