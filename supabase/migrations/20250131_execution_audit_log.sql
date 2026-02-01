-- Phase 4: Execution Audit Log
-- SOC2-grade logging for every LLM call, tool invocation, and token spent

-- Audit log table
CREATE TABLE IF NOT EXISTS execution_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID REFERENCES task_executions(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('llm_call', 'tool_call', 'plan_generated', 'plan_approved', 'error')),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- LLM call details
  provider TEXT,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  duration_ms INTEGER,
  cost_cents INTEGER DEFAULT 0,

  -- Tool call details
  tool_name TEXT,
  tool_input JSONB,
  tool_output TEXT,
  tool_success BOOLEAN,

  -- Context
  agent_id UUID,
  task_id UUID,
  step_index INTEGER,
  account_id UUID NOT NULL,

  -- Error details
  error_message TEXT,
  error_code TEXT
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_audit_log_execution ON execution_audit_log(execution_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_account ON execution_audit_log(account_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON execution_audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON execution_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_agent ON execution_audit_log(agent_id);

-- RLS
ALTER TABLE execution_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_account_access" ON execution_audit_log
  FOR ALL USING (account_id IN (
    SELECT account_id FROM user_accounts WHERE user_id = auth.uid()
  ));

-- Materialized view: daily cost summary per account
CREATE OR REPLACE VIEW account_execution_costs AS
SELECT
  account_id,
  DATE_TRUNC('day', timestamp) AS day,
  SUM(cost_cents) AS total_cost_cents,
  SUM(input_tokens) AS total_input_tokens,
  SUM(output_tokens) AS total_output_tokens,
  COUNT(*) FILTER (WHERE event_type = 'llm_call') AS llm_calls,
  COUNT(*) FILTER (WHERE event_type = 'tool_call') AS tool_calls,
  COUNT(*) FILTER (WHERE event_type = 'error') AS errors
FROM execution_audit_log
GROUP BY account_id, DATE_TRUNC('day', timestamp);
