-- Per-Agent Queue Isolation, A2A Messaging, Agent-Created Skills
-- Three features in one migration

-- ============================================================================
-- 1. PER-AGENT QUEUE: Add max_concurrent_tasks to agent_personas
-- ============================================================================

ALTER TABLE agent_personas
  ADD COLUMN IF NOT EXISTS max_concurrent_tasks INTEGER DEFAULT 2;

COMMENT ON COLUMN agent_personas.max_concurrent_tasks IS
  'Max tasks this agent can execute simultaneously (queue isolation)';

-- ============================================================================
-- 2. AGENT-TO-AGENT MESSAGING (A2A)
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- Sender
  from_id UUID NOT NULL,
  from_type TEXT NOT NULL CHECK (from_type IN ('agent', 'user')),

  -- Recipient
  to_id UUID NOT NULL,
  to_type TEXT NOT NULL CHECK (to_type IN ('agent', 'user')),

  -- Content
  message_type TEXT NOT NULL DEFAULT 'request'
    CHECK (message_type IN ('request', 'response', 'broadcast', 'alert', 'status')),
  subject TEXT,
  content TEXT NOT NULL,

  -- Threading
  session_id UUID,
  in_reply_to UUID REFERENCES agent_messages(id),

  -- Protocol
  protocol TEXT NOT NULL DEFAULT 'a2a'
    CHECK (protocol IN ('a2a', 'mcp', 'internal')),

  -- Verification
  signature_hash TEXT,
  verified BOOLEAN DEFAULT false,

  -- Status
  status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  read_at TIMESTAMPTZ,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  created_by_type TEXT DEFAULT 'agent',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT,
  updated_by_type TEXT DEFAULT 'agent',

  -- Soft delete
  deleted_at TIMESTAMPTZ
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_agent_messages_recipient
  ON agent_messages(account_id, to_id, to_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_messages_sender
  ON agent_messages(account_id, from_id, from_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_messages_session
  ON agent_messages(session_id) WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_messages_unread
  ON agent_messages(account_id, to_id, to_type)
  WHERE read_at IS NULL AND deleted_at IS NULL;

-- RLS (drop-then-create for idempotency — PostgreSQL has no CREATE POLICY IF NOT EXISTS)
ALTER TABLE agent_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read messages in their account" ON agent_messages;
CREATE POLICY "Users can read messages in their account"
  ON agent_messages FOR SELECT
  USING (account_id IN (
    SELECT account_id FROM user_accounts WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can insert messages in their account" ON agent_messages;
CREATE POLICY "Users can insert messages in their account"
  ON agent_messages FOR INSERT
  WITH CHECK (account_id IN (
    SELECT account_id FROM user_accounts WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can update messages in their account" ON agent_messages;
CREATE POLICY "Users can update messages in their account"
  ON agent_messages FOR UPDATE
  USING (account_id IN (
    SELECT account_id FROM user_accounts WHERE user_id = auth.uid()
  ));

-- Service role bypass for edge functions
DROP POLICY IF EXISTS "Service role full access to agent_messages" ON agent_messages;
CREATE POLICY "Service role full access to agent_messages"
  ON agent_messages FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- 3. AGENT-CREATED SKILLS: Allow source_type 'agent' on skills table
-- ============================================================================

-- Add 'agent' as a valid source_type (existing check may be implicit or via app layer)
-- Also add created_by_agent_id to track which agent created a skill
ALTER TABLE skills
  ADD COLUMN IF NOT EXISTS created_by_agent_id UUID;

COMMENT ON COLUMN skills.created_by_agent_id IS
  'Agent that created this skill (for agent-created skills)';
