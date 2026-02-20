-- Phase 1B: Guardrail audit log — records every guardrail decision
-- Used by the guardrail middleware and the orchestrator dashboard

CREATE TABLE IF NOT EXISTS guardrail_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- What triggered the guardrail check
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES agent_personas(id) ON DELETE SET NULL,
  skill_id UUID REFERENCES skills(id) ON DELETE SET NULL,

  -- Guardrail decision
  category TEXT NOT NULL,            -- trust category: task_execution, decomposition, skill_creation, tool_usage, content_publishing, external_actions, spending, agent_creation
  action TEXT NOT NULL,              -- what was attempted: e.g. 'create_subtask', 'publish_blog', 'spend_tokens'
  decision TEXT NOT NULL DEFAULT 'denied',  -- approved, denied, escalated, exception
  decided_by TEXT NOT NULL DEFAULT 'system', -- human, orchestrator, system
  trust_level_required INTEGER NOT NULL DEFAULT 0,  -- the trust level the action needed
  trust_level_current INTEGER NOT NULL DEFAULT 0,   -- the account's current trust level for this category

  -- Context
  rationale TEXT,                    -- why this decision was made
  metadata JSONB DEFAULT '{}',       -- extra context (tool name, cost estimate, etc.)

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE guardrail_audit_log IS
  'Audit trail for all guardrail decisions — approvals, denials, escalations';

-- Indexes for querying
CREATE INDEX IF NOT EXISTS idx_guardrail_audit_account ON guardrail_audit_log(account_id);
CREATE INDEX IF NOT EXISTS idx_guardrail_audit_task ON guardrail_audit_log(task_id);
CREATE INDEX IF NOT EXISTS idx_guardrail_audit_category ON guardrail_audit_log(category);
CREATE INDEX IF NOT EXISTS idx_guardrail_audit_decision ON guardrail_audit_log(decision);
CREATE INDEX IF NOT EXISTS idx_guardrail_audit_created ON guardrail_audit_log(created_at DESC);

-- RLS
ALTER TABLE guardrail_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own account guardrail_audit_log" ON guardrail_audit_log;
CREATE POLICY "Users can view own account guardrail_audit_log" ON guardrail_audit_log
  FOR SELECT USING (
    account_id IN (SELECT account_id FROM user_accounts WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Service role full access on guardrail_audit_log" ON guardrail_audit_log;
CREATE POLICY "Service role full access on guardrail_audit_log" ON guardrail_audit_log
  FOR ALL USING (auth.role() = 'service_role');
