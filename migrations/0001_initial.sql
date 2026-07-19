-- posts 表
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  pub_date DATETIME NOT NULL,
  category TEXT NOT NULL,
  creator TEXT NOT NULL,
  is_push INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_post_id ON posts(post_id);
CREATE INDEX IF NOT EXISTS idx_posts_pending_created ON posts(is_push, created_at);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at);

-- users 表
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL UNIQUE,
  username TEXT DEFAULT NULL,
  first_name TEXT DEFAULT NULL,
  last_name TEXT DEFAULT NULL,
  max_sub INTEGER DEFAULT 10, -- 最大订阅数
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 为 users 创建索引
-- chat_id UNIQUE already creates the lookup index used by bot commands.

-- keywords_sub 表
CREATE TABLE IF NOT EXISTS keywords_sub (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  keywords_count INTEGER DEFAULT NULL,
  keyword1 TEXT NOT NULL,
  keyword2 TEXT DEFAULT NULL,
  keyword3 TEXT DEFAULT NULL,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 为 keywords_sub 创建索引
CREATE INDEX IF NOT EXISTS idx_keywords_sub_user_id ON keywords_sub(user_id);
CREATE INDEX IF NOT EXISTS idx_keywords_sub_active_user ON keywords_sub(is_active, user_id);

-- push_logs 表
CREATE TABLE IF NOT EXISTS push_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  chat_id INTEGER NOT NULL,
  post_id INTEGER NOT NULL,
  sub_id INTEGER NOT NULL,
  push_status INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 为 push_logs 创建索引和唯一约束
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_logs_user_chat ON push_logs(chat_id, post_id);
CREATE INDEX IF NOT EXISTS idx_push_logs_created_at ON push_logs(created_at);
