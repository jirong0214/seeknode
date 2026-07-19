-- Indexes for the bounded pending queue and active-subscription lookup.
-- This migration intentionally does not rebuild idx_posts_post_id as UNIQUE:
-- legacy databases may contain duplicates. Fresh databases get the UNIQUE index
-- from 0001_initial.sql; the single internal cron prevents new concurrent inserts.
CREATE INDEX IF NOT EXISTS idx_posts_pending_created
  ON posts(is_push, created_at);
CREATE INDEX IF NOT EXISTS idx_posts_created_at
  ON posts(created_at);
CREATE INDEX IF NOT EXISTS idx_keywords_sub_active_user
  ON keywords_sub(is_active, user_id);
CREATE INDEX IF NOT EXISTS idx_push_logs_created_at
  ON push_logs(created_at);

-- Drop indexes made redundant by the composite indexes or no longer used by
-- the refactored query path. Fewer indexes also means fewer billed rows written.
DROP INDEX IF EXISTS idx_posts_is_push;
DROP INDEX IF EXISTS idx_users_chat_id;
DROP INDEX IF EXISTS idx_push_logs_user_id;
DROP INDEX IF EXISTS idx_push_logs_post_id;
DROP INDEX IF EXISTS idx_push_logs_push_status;
