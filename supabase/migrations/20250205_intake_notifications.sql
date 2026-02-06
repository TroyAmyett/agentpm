-- Intake & Notification System
-- Enables inbound task creation from email, Slack, Telegram, webhooks
-- and outbound status notifications back to originating channels

-- ═══════════════════════════════════════════════════════════════════════════════
-- INTAKE CHANNELS — Inbound task creation configuration
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS intake_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- Channel identity
  channel_type TEXT NOT NULL
    CHECK (channel_type IN ('email', 'slack', 'telegram', 'webhook', 'api')),
  name TEXT NOT NULL,
  description TEXT,

  -- Channel-specific configuration (JSONB — sensitive values encrypted at app layer)
  -- email:    { address, domain, forward_to }
  -- slack:    { team_id, team_name, channel_id, channel_name, bot_token_enc, signing_secret_enc }
  -- telegram: { bot_token_enc, bot_username, chat_id }
  -- webhook:  { secret_hash, allowed_ips[] }
  -- api:      { api_key_id }
  config JSONB NOT NULL DEFAULT '{}',

  -- Unique routing address (email address, webhook slug, etc.)
  channel_address TEXT,  -- e.g., 'tasks+a1b2c3@inbound.agentpm.app'
  webhook_slug TEXT,     -- e.g., 'a1b2c3' for /api/intake/webhook/a1b2c3

  -- Routing defaults — where do incoming tasks land?
  default_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  default_agent_id UUID REFERENCES agent_personas(id) ON DELETE SET NULL,
  default_priority TEXT DEFAULT 'medium'
    CHECK (default_priority IN ('critical', 'high', 'medium', 'low')),
  default_status TEXT DEFAULT 'pending'
    CHECK (default_status IN ('draft', 'pending', 'queued')),

  -- AI parsing behavior
  auto_parse BOOLEAN DEFAULT true,      -- Use AI to extract title/description/priority
  auto_assign BOOLEAN DEFAULT false,    -- Use AI to auto-assign to best agent
  auto_execute BOOLEAN DEFAULT false,   -- Automatically queue for execution after creation

  -- Status
  is_active BOOLEAN DEFAULT true,
  verified_at TIMESTAMPTZ,

  -- Stats
  total_tasks_created INTEGER DEFAULT 0,
  last_received_at TIMESTAMPTZ,

  -- Audit
  created_by UUID,
  created_by_type TEXT DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- INTAKE LOG — Record of every inbound message/event received
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS intake_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES intake_channels(id) ON DELETE CASCADE,

  -- Source info
  source_type TEXT NOT NULL
    CHECK (source_type IN ('email', 'slack', 'telegram', 'webhook', 'api', 'voice')),
  source_id TEXT,             -- External message ID (email Message-ID, Slack ts, etc.)
  sender_address TEXT,        -- From address, Slack user ID, Telegram user ID
  sender_name TEXT,

  -- Raw content
  raw_subject TEXT,
  raw_body TEXT,
  raw_payload JSONB,          -- Full raw payload for debugging

  -- AI-parsed content
  parsed_title TEXT,
  parsed_description TEXT,
  parsed_priority TEXT,
  parsed_project_id UUID,
  parsed_agent_id UUID,
  parsed_tags TEXT[],
  parse_confidence FLOAT,

  -- Processing result
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'parsing', 'parsed', 'task_created', 'failed', 'rejected', 'duplicate')),
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  error TEXT,

  -- Attachments
  attachment_count INTEGER DEFAULT 0,
  attachments JSONB DEFAULT '[]',    -- [{ name, size, content_type, storage_path }]

  -- Timestamps
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  parsed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- NOTIFICATION CHANNELS — Outbound notification configuration
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notification_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- Channel identity
  channel_type TEXT NOT NULL
    CHECK (channel_type IN ('email', 'slack', 'telegram', 'webhook', 'in_app')),
  name TEXT NOT NULL,

  -- Channel-specific config (sensitive values encrypted at app layer)
  -- email:    { to_address, from_name, reply_to }
  -- slack:    { webhook_url, channel_id, bot_token_enc }
  -- telegram: { bot_token_enc, chat_id }
  -- webhook:  { url, method, headers, secret }
  -- in_app:   {} (built-in, no config needed)
  config JSONB NOT NULL DEFAULT '{}',

  -- What events trigger notifications
  notify_on TEXT[] DEFAULT ARRAY['completed', 'failed', 'review'],
  -- Options: queued, in_progress, review, completed, failed, cancelled

  -- Filters — NULL means all
  project_ids UUID[],         -- Only notify for these projects (NULL = all)
  agent_ids UUID[],           -- Only notify for these agents (NULL = all)

  -- Link back to intake channel (for reply-to-sender pattern)
  intake_channel_id UUID REFERENCES intake_channels(id) ON DELETE SET NULL,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Stats
  total_sent INTEGER DEFAULT 0,
  last_sent_at TIMESTAMPTZ,

  -- Audit
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- NOTIFICATION LOG — Record of every outbound notification
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES notification_channels(id) ON DELETE CASCADE,

  -- What triggered it
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  workflow_run_id UUID REFERENCES workflow_runs(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,   -- task_status_change, review_needed, workflow_complete, etc.
  previous_status TEXT,       -- For status changes: what it was
  new_status TEXT,            -- For status changes: what it became

  -- Content sent
  subject TEXT,
  body TEXT,
  payload JSONB,

  -- Delivery status
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'delivered', 'failed')),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  error TEXT,
  external_id TEXT,           -- Provider message ID for tracking

  -- Retry tracking
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  next_retry_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- EXTEND TASKS — Track intake source on tasks
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS intake_channel_id UUID;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS intake_log_id UUID;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS intake_sender TEXT;

-- FK constraints (safe creation)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'tasks_intake_channel_id_fkey'
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT tasks_intake_channel_id_fkey
      FOREIGN KEY (intake_channel_id) REFERENCES intake_channels(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'tasks_intake_log_id_fkey'
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT tasks_intake_log_id_fkey
      FOREIGN KEY (intake_log_id) REFERENCES intake_log(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- EXTEND API KEY SCOPES — Add intake-related permissions
-- ═══════════════════════════════════════════════════════════════════════════════

-- The agent_api_keys table already exists with scopes TEXT[]
-- We just document the new scope values that can be stored:
-- 'intake:create'  — Can create tasks via intake endpoint
-- 'intake:read'    — Can read intake log
-- 'notify:send'    — Can trigger notifications

-- ═══════════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Intake channels
CREATE INDEX IF NOT EXISTS idx_intake_channels_account
  ON intake_channels(account_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_intake_channels_type
  ON intake_channels(account_id, channel_type) WHERE deleted_at IS NULL AND is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_intake_channels_address
  ON intake_channels(channel_address) WHERE channel_address IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_intake_channels_webhook_slug
  ON intake_channels(webhook_slug) WHERE webhook_slug IS NOT NULL AND deleted_at IS NULL;

-- Intake log
CREATE INDEX IF NOT EXISTS idx_intake_log_account
  ON intake_log(account_id);
CREATE INDEX IF NOT EXISTS idx_intake_log_channel
  ON intake_log(channel_id);
CREATE INDEX IF NOT EXISTS idx_intake_log_status
  ON intake_log(status) WHERE status IN ('received', 'parsing');
CREATE INDEX IF NOT EXISTS idx_intake_log_task
  ON intake_log(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_intake_log_received
  ON intake_log(received_at DESC);

-- Notification channels
CREATE INDEX IF NOT EXISTS idx_notification_channels_account
  ON notification_channels(account_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notification_channels_active
  ON notification_channels(account_id, channel_type)
  WHERE is_active = true AND deleted_at IS NULL;

-- Notification log
CREATE INDEX IF NOT EXISTS idx_notification_log_account
  ON notification_log(account_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_task
  ON notification_log(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notification_log_pending
  ON notification_log(status, next_retry_at)
  WHERE status IN ('pending', 'sending');
CREATE INDEX IF NOT EXISTS idx_notification_log_created
  ON notification_log(created_at DESC);

-- Tasks intake tracking
CREATE INDEX IF NOT EXISTS idx_tasks_intake_channel
  ON tasks(intake_channel_id) WHERE intake_channel_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE intake_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "intake_channels_account_access" ON intake_channels
  FOR ALL USING (account_id IN (
    SELECT account_id FROM user_accounts WHERE user_id = auth.uid()
  ));

ALTER TABLE intake_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "intake_log_account_access" ON intake_log
  FOR ALL USING (account_id IN (
    SELECT account_id FROM user_accounts WHERE user_id = auth.uid()
  ));

ALTER TABLE notification_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_channels_account_access" ON notification_channels
  FOR ALL USING (account_id IN (
    SELECT account_id FROM user_accounts WHERE user_id = auth.uid()
  ));

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_log_account_access" ON notification_log
  FOR ALL USING (account_id IN (
    SELECT account_id FROM user_accounts WHERE user_id = auth.uid()
  ));

-- Service role bypass for edge functions (they use SUPABASE_SERVICE_ROLE_KEY)
-- Service role already bypasses RLS by default in Supabase

-- ═══════════════════════════════════════════════════════════════════════════════
-- TRIGGER: Auto-notify on task status change
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION notify_on_task_status_change()
RETURNS TRIGGER AS $$
DECLARE
  channel_rec RECORD;
BEGIN
  -- Only fire on status changes
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Queue notifications for each active notification channel that matches
  FOR channel_rec IN
    SELECT nc.id, nc.channel_type, nc.config, nc.notify_on
    FROM notification_channels nc
    WHERE nc.account_id = NEW.account_id
      AND nc.is_active = true
      AND nc.deleted_at IS NULL
      AND NEW.status = ANY(nc.notify_on)
      AND (
        nc.project_ids IS NULL
        OR NEW.project_id = ANY(nc.project_ids)
      )
      AND (
        nc.agent_ids IS NULL
        OR NEW.assigned_to = ANY(nc.agent_ids)
      )
  LOOP
    INSERT INTO notification_log (
      account_id, channel_id, task_id, event_type,
      previous_status, new_status, status
    ) VALUES (
      NEW.account_id, channel_rec.id, NEW.id, 'task_status_change',
      OLD.status, NEW.status, 'pending'
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop if exists (safe re-run)
DROP TRIGGER IF EXISTS trg_task_status_notify ON tasks;

CREATE TRIGGER trg_task_status_notify
  AFTER UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_task_status_change();

-- ═══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: Process pending notifications (called by pg_cron)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION process_pending_notifications()
RETURNS void AS $$
DECLARE
  notif_rec RECORD;
  task_rec RECORD;
  channel_rec RECORD;
  notif_body TEXT;
  notif_subject TEXT;
BEGIN
  -- Process up to 50 pending notifications per run
  FOR notif_rec IN
    SELECT nl.id, nl.account_id, nl.channel_id, nl.task_id,
           nl.event_type, nl.previous_status, nl.new_status, nl.attempts
    FROM notification_log nl
    WHERE nl.status = 'pending'
      AND nl.attempts < nl.max_attempts
      AND (nl.next_retry_at IS NULL OR nl.next_retry_at <= NOW())
    ORDER BY nl.created_at ASC
    LIMIT 50
  LOOP
    -- Mark as sending
    UPDATE notification_log
    SET status = 'sending', attempts = notif_rec.attempts + 1
    WHERE id = notif_rec.id;

    -- Get task details
    SELECT title, description, status, assigned_to, project_id
    INTO task_rec
    FROM tasks WHERE id = notif_rec.task_id;

    -- Get channel details
    SELECT channel_type, config, name
    INTO channel_rec
    FROM notification_channels WHERE id = notif_rec.channel_id;

    -- Build notification content
    notif_subject := 'Task ' || notif_rec.new_status || ': ' || COALESCE(task_rec.title, 'Unknown');
    notif_body := 'Task "' || COALESCE(task_rec.title, 'Unknown') || '" changed from '
      || notif_rec.previous_status || ' to ' || notif_rec.new_status;

    -- Store the built content (actual delivery handled by edge function)
    UPDATE notification_log
    SET subject = notif_subject,
        body = notif_body,
        status = 'pending'  -- Edge function will pick up and deliver
    WHERE id = notif_rec.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Schedule notification processing every minute
SELECT cron.schedule(
  'process-pending-notifications',
  '* * * * *',
  'SELECT process_pending_notifications()'
);
