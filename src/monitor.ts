import { Bot } from 'grammy'
import type { Env } from './env'

const RSS_URL = 'https://rss.nodeseek.com/'
const PENDING_POST_LIMIT = 50
const RETENTION_DAYS = 90
const CLEANUP_BATCH_SIZE = 1_000

export interface RSSPost {
  id: number
  title: string
  description: string
  pubDate: string
  category: string
  creator: string
}

export interface DBPost {
  post_id: number
  title: string
  content: string
  pub_date: string
  category: string
  creator: string
}

export interface ActiveSubscription {
  user_id: number
  chat_id: number
  sub_id: number
  keywords_count: number
  keyword1: string
  keyword2?: string
  keyword3?: string
}

export interface MonitorStats {
  rssPostsCount: number
  savedNewPosts: number
  postsProcessed: number
  activeSubscriptions: number
  successfulNotifications: number
  failedNotifications: number
}

export function parseRSSXML(xmlText: string): RSSPost[] {
  const posts: RSSPost[] = []
  const items = xmlText.match(/<item>([\s\S]*?)<\/item>/g) ?? []

  for (const item of items) {
    const link = item.match(/<link>(.*?)<\/link>/)?.[1] ?? ''
    const postId = Number(link.match(/post-(\d+)-/)?.[1])
    if (!Number.isSafeInteger(postId)) continue

    const extract = (cdata: RegExp, plain: RegExp, fallback = '') =>
      (item.match(cdata)?.[1] ?? item.match(plain)?.[1] ?? fallback).trim()

    posts.push({
      id: postId,
      title: extract(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/, /<title>([\s\S]*?)<\/title>/, '无标题'),
      description: extract(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/, /<description>([\s\S]*?)<\/description>/),
      pubDate: extract(/<pubDate><!\[CDATA\[([\s\S]*?)\]\]><\/pubDate>/, /<pubDate>([\s\S]*?)<\/pubDate>/),
      category: extract(/<category><!\[CDATA\[([\s\S]*?)\]\]><\/category>/, /<category>([\s\S]*?)<\/category>/, '未分类'),
      creator: extract(/<dc:creator><!\[CDATA\[([\s\S]*?)\]\]><\/dc:creator>/, /<dc:creator>([\s\S]*?)<\/dc:creator>/, '未知作者'),
    })
  }

  return posts
}

async function fetchRSSData(): Promise<RSSPost[]> {
  const response = await fetch(RSS_URL, {
    headers: {
      Accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8',
      'User-Agent': 'SeekNode RSS monitor',
    },
  })

  if (!response.ok) {
    throw new Error(`RSS request failed: ${response.status} ${response.statusText}`)
  }

  return parseRSSXML(await response.text())
}

async function saveNewPosts(db: D1Database, rssPosts: RSSPost[]): Promise<number> {
  const posts = [...new Map(rssPosts.map((post) => [post.id, post])).values()]
  if (posts.length === 0) return 0

  const placeholders = posts.map(() => '?').join(',')
  const existing = await db
    .prepare(`SELECT post_id FROM posts WHERE post_id IN (${placeholders})`)
    .bind(...posts.map((post) => post.id))
    .all<{ post_id: number }>()
  const existingIds = new Set(existing.results.map((row) => row.post_id))
  const newPosts = posts.filter((post) => !existingIds.has(post.id))
  if (newPosts.length === 0) return 0

  const results = await db.batch(
    newPosts.map((post) =>
      db
        .prepare(`
          INSERT INTO posts (post_id, title, content, pub_date, category, creator, is_push)
          VALUES (?, ?, ?, ?, ?, ?, 0)
        `)
        .bind(post.id, post.title, post.description, post.pubDate, post.category, post.creator),
    ),
  )

  return results.filter((result) => result.success).length
}

async function getPendingPosts(db: D1Database): Promise<DBPost[]> {
  const result = await db
    .prepare(`
      SELECT post_id, title, content, pub_date, category, creator
      FROM posts
      WHERE is_push = 0
      ORDER BY created_at ASC
      LIMIT ?
    `)
    .bind(PENDING_POST_LIMIT)
    .all<DBPost>()
  return result.results
}

async function getActiveSubscriptions(db: D1Database): Promise<ActiveSubscription[]> {
  const result = await db.prepare(`
    SELECT
      u.id AS user_id,
      u.chat_id,
      ks.id AS sub_id,
      ks.keywords_count,
      ks.keyword1,
      ks.keyword2,
      ks.keyword3
    FROM keywords_sub ks
    JOIN users u ON u.id = ks.user_id
    WHERE ks.is_active = 1 AND u.is_active = 1
  `).all<ActiveSubscription>()
  return result.results
}

export function matchKeywords(post: DBPost, subscription: ActiveSubscription): boolean {
  const searchText = `${post.title} ${post.content} ${post.category} ${post.creator}`.toLowerCase()
  const keywords = [subscription.keyword1, subscription.keyword2, subscription.keyword3]
    .slice(0, subscription.keywords_count)
    .filter((keyword): keyword is string => Boolean(keyword))
    .map((keyword) => keyword.toLowerCase())

  return keywords.length === subscription.keywords_count && keywords.every((keyword) => searchText.includes(keyword))
}

function groupSubscriptionsByUser(subscriptions: ActiveSubscription[]): ActiveSubscription[][] {
  const grouped = new Map<number, ActiveSubscription[]>()
  for (const subscription of subscriptions) {
    const entries = grouped.get(subscription.user_id) ?? []
    entries.push(subscription)
    grouped.set(subscription.user_id, entries)
  }
  return [...grouped.values()]
}

async function reserveNotification(db: D1Database, subscription: ActiveSubscription, postId: number): Promise<boolean> {
  const result = await db.prepare(`
    INSERT OR IGNORE INTO push_logs
      (user_id, chat_id, post_id, sub_id, push_status, error_message)
    VALUES (?, ?, ?, ?, 0, NULL)
  `).bind(subscription.user_id, subscription.chat_id, postId, subscription.sub_id).run()

  return (result.meta.changes ?? 0) === 1
}

async function updateNotificationStatus(db: D1Database, chatId: number, postId: number, status: number, error?: string): Promise<void> {
  await db.prepare(`
    UPDATE push_logs
    SET push_status = ?, error_message = ?
    WHERE chat_id = ? AND post_id = ?
  `).bind(status, error ?? null, chatId, postId).run()
}

async function markPostsProcessed(db: D1Database, postIds: number[]): Promise<void> {
  if (postIds.length === 0) return
  const placeholders = postIds.map(() => '?').join(',')
  await db.prepare(`UPDATE posts SET is_push = 1 WHERE post_id IN (${placeholders})`).bind(...postIds).run()
}

function buildMessage(post: DBPost, subscription: ActiveSubscription): string {
  const keywords = [subscription.keyword1, subscription.keyword2, subscription.keyword3]
    .slice(0, subscription.keywords_count)
    .filter((keyword): keyword is string => Boolean(keyword))
    .map(escapeMarkdownV2)
  const safeTitle = escapeMarkdownV2(post.title)
  return `🎯 ${keywords.join(', ')}\n\n[${safeTitle}](https://www.nodeseek.com/post-${post.post_id}-1)`
}

function escapeMarkdownV2(value: string): string {
  return value.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1')
}

export async function processPendingPosts(env: Env, posts: DBPost[], subscriptions: ActiveSubscription[]): Promise<{ successful: number; failed: number }> {
  let successful = 0
  let failed = 0
  const bot = new Bot(env.BOT_TOKEN)
  const subscriptionsByUser = groupSubscriptionsByUser(subscriptions)
  const completedPostIds: number[] = []

  try {
    for (const post of posts) {
      for (const userSubscriptions of subscriptionsByUser) {
        const matched = userSubscriptions.find((subscription) => matchKeywords(post, subscription))
        if (!matched || !(await reserveNotification(env.DB, matched, post.post_id))) continue

        try {
          await bot.api.sendMessage(matched.chat_id, buildMessage(post, matched), {
            parse_mode: 'MarkdownV2',
            link_preview_options: { is_disabled: false },
          })
          await updateNotificationStatus(env.DB, matched.chat_id, post.post_id, 1)
          successful++
        } catch (error) {
          await updateNotificationStatus(env.DB, matched.chat_id, post.post_id, 2, String(error).slice(0, 500))
          failed++
        }
      }

      completedPostIds.push(post.post_id)
    }
  } finally {
    // Completed posts are finalized even when there are no users or no matches.
    // Posts not reached because of an unexpected error remain queued for retry.
    await markPostsProcessed(env.DB, completedPostIds)
  }

  return { successful, failed }
}

export async function runMonitor(env: Env): Promise<MonitorStats> {
  const rssPosts = await fetchRSSData()
  const savedNewPosts = await saveNewPosts(env.DB, rssPosts)
  const pendingPosts = await getPendingPosts(env.DB)

  if (pendingPosts.length === 0) {
    return {
      rssPostsCount: rssPosts.length,
      savedNewPosts,
      postsProcessed: 0,
      activeSubscriptions: 0,
      successfulNotifications: 0,
      failedNotifications: 0,
    }
  }

  const subscriptions = await getActiveSubscriptions(env.DB)
  const pushes = await processPendingPosts(env, pendingPosts, subscriptions)

  return {
    rssPostsCount: rssPosts.length,
    savedNewPosts,
    postsProcessed: pendingPosts.length,
    activeSubscriptions: subscriptions.length,
    successfulNotifications: pushes.successful,
    failedNotifications: pushes.failed,
  }
}

export async function cleanupExpiredData(db: D1Database): Promise<{ postsDeleted: number; logsDeleted: number }> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1_000).toISOString()
  const [logs, posts] = await db.batch([
    db.prepare(`
      DELETE FROM push_logs
      WHERE id IN (
        SELECT id FROM push_logs WHERE created_at < ? ORDER BY created_at LIMIT ?
      )
    `).bind(cutoff, CLEANUP_BATCH_SIZE),
    db.prepare(`
      DELETE FROM posts
      WHERE id IN (
        SELECT id FROM posts WHERE created_at < ? ORDER BY created_at LIMIT ?
      )
    `).bind(cutoff, CLEANUP_BATCH_SIZE),
  ])

  return {
    logsDeleted: logs.meta.changes ?? 0,
    postsDeleted: posts.meta.changes ?? 0,
  }
}
