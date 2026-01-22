-- Task Executions Table
-- Tracks agent execution of tasks

CREATE TABLE IF NOT EXISTS task_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agent_personas(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  skill_id UUID REFERENCES skills(id) ON DELETE SET NULL,

  -- Execution status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'running',
    'completed',
    'failed',
    'cancelled',
    'awaiting_approval'
  )),

  -- Input context (what was sent to Claude)
  input_prompt TEXT,
  input_context JSONB,  -- task details, skill content, agent persona

  -- Output from Claude
  output_content TEXT,
  output_metadata JSONB,  -- tokens used, model, etc.

  -- Error tracking
  error_message TEXT,
  error_details JSONB,

  -- Approval workflow
  requires_approval BOOLEAN DEFAULT FALSE,
  approval_reason TEXT,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,

  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Who triggered it
  triggered_by UUID NOT NULL,
  triggered_by_type TEXT NOT NULL DEFAULT 'user' CHECK (triggered_by_type IN ('user', 'agent', 'schedule'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_task_executions_task_id ON task_executions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_executions_agent_id ON task_executions(agent_id);
CREATE INDEX IF NOT EXISTS idx_task_executions_account_id ON task_executions(account_id);
CREATE INDEX IF NOT EXISTS idx_task_executions_status ON task_executions(status);
CREATE INDEX IF NOT EXISTS idx_task_executions_created_at ON task_executions(created_at DESC);

-- RLS
ALTER TABLE task_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view executions in their account" ON task_executions
  FOR SELECT
  USING (account_id IN (
    SELECT account_id FROM user_accounts WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can create executions in their account" ON task_executions
  FOR INSERT
  WITH CHECK (account_id IN (
    SELECT account_id FROM user_accounts WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update executions in their account" ON task_executions
  FOR UPDATE
  USING (account_id IN (
    SELECT account_id FROM user_accounts WHERE user_id = auth.uid()
  ));

-- Comments
COMMENT ON TABLE task_executions IS 'Tracks individual agent execution runs for tasks';
COMMENT ON COLUMN task_executions.input_context IS 'JSON containing task, skill, and agent context sent to Claude';
COMMENT ON COLUMN task_executions.output_content IS 'The main content output from Claude (text, markdown, etc.)';
COMMENT ON COLUMN task_executions.output_metadata IS 'Metadata about the execution: tokens, model, timing, etc.';
