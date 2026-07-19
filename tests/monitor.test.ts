import { describe, expect, it } from 'vitest'
import { matchKeywords, parseRSSXML, processPendingPosts, type ActiveSubscription, type DBPost } from '../src/monitor'
import type { Env } from '../src/env'

const post: DBPost = {
  post_id: 123,
  title: 'Cloudflare D1 优化实践',
  content: '使用复合索引减少数据库扫描',
  pub_date: '2026-07-19',
  category: '技术',
  creator: 'tester',
}

function subscription(overrides: Partial<ActiveSubscription> = {}): ActiveSubscription {
  return {
    user_id: 1,
    chat_id: 2,
    sub_id: 3,
    keywords_count: 1,
    keyword1: 'cloudflare',
    ...overrides,
  }
}

describe('parseRSSXML', () => {
  it('extracts valid NodeSeek posts and skips malformed IDs', () => {
    const xml = `
      <rss><channel>
        <item>
          <title><![CDATA[测试帖子]]></title>
          <link>https://www.nodeseek.com/post-123-1</link>
          <description><![CDATA[正文]]></description>
          <pubDate>Sun, 19 Jul 2026 00:00:00 GMT</pubDate>
          <category><![CDATA[技术]]></category>
          <dc:creator><![CDATA[user]]></dc:creator>
        </item>
        <item><title>无效帖子</title><link>https://example.com/no-id</link></item>
      </channel></rss>
    `

    expect(parseRSSXML(xml)).toEqual([
      {
        id: 123,
        title: '测试帖子',
        description: '正文',
        pubDate: 'Sun, 19 Jul 2026 00:00:00 GMT',
        category: '技术',
        creator: 'user',
      },
    ])
  })
})

describe('matchKeywords', () => {
  it('matches case-insensitively across post fields', () => {
    expect(matchKeywords(post, subscription())).toBe(true)
  })

  it('requires every configured keyword', () => {
    expect(matchKeywords(post, subscription({ keywords_count: 2, keyword2: '复合索引' }))).toBe(true)
    expect(matchKeywords(post, subscription({ keywords_count: 2, keyword2: '不存在' }))).toBe(false)
  })

  it('rejects incomplete subscriptions', () => {
    expect(matchKeywords(post, subscription({ keywords_count: 2, keyword2: undefined }))).toBe(false)
  })
})

describe('pending queue completion', () => {
  it('marks posts processed even when there are no active subscriptions', async () => {
    const statements: Array<{ query: string; bindings: unknown[] }> = []
    const db = {
      prepare(query: string) {
        return {
          bind(...bindings: unknown[]) {
            return {
              async run() {
                statements.push({ query, bindings })
                return { success: true, meta: { changes: 1 } }
              },
            }
          },
        }
      },
    } as unknown as D1Database
    const env = {
      BOT_TOKEN: '123:test',
      TELEGRAM_WEBHOOK_SECRET: 'telegram-secret',
      ADMIN_TOKEN: 'admin-secret',
      DB: db,
    } satisfies Env

    await processPendingPosts(env, [post], [])

    expect(statements).toHaveLength(1)
    expect(statements[0].query).toContain('UPDATE posts SET is_push = 1')
    expect(statements[0].bindings).toEqual([123])
  })
})
