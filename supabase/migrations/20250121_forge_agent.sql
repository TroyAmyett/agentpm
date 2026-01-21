-- Forge Agent Migration
-- Creates tables for the Forge developer agent that executes PRDs against code

-- Forge Sessions table - tracks PRD execution sessions
CREATE TABLE IF NOT EXISTS forge_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agent_personas(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- PRD Input
  input JSONB NOT NULL,

  -- Execution Status
  status TEXT NOT NULL DEFAULT 'initializing' CHECK (status IN (
    'initializing',
    'analyzing',
    'implementing',
    'testing',
    'committing',
    'pushing',
    'creating-pr',
    'completed',
    'failed',
    'awaiting-approval'
  )),
  current_step TEXT,
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),

  -- Output (built up during execution)
  output JSONB,

  -- Claude Code CLI integration
  claude_code_session_id TEXT,
  claude_code_output_path TEXT,

  -- Error tracking
  error TEXT,
  error_step TEXT,

  -- Timestamps
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Audit
  created_by UUID NOT NULL,
  created_by_type TEXT NOT NULL DEFAULT 'user' CHECK (created_by_type IN ('user', 'agent'))
);

-- Indexes for forge_sessions
CREATE INDEX IF NOT EXISTS idx_forge_sessions_task_id ON forge_sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_forge_sessions_agent_id ON forge_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_forge_sessions_account_id ON forge_sessions(account_id);
CREATE INDEX IF NOT EXISTS idx_forge_sessions_status ON forge_sessions(status);
CREATE INDEX IF NOT EXISTS idx_forge_sessions_started_at ON forge_sessions(started_at DESC);

-- RLS for forge_sessions
ALTER TABLE forge_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view sessions in their account
CREATE POLICY forge_sessions_select ON forge_sessions
  FOR SELECT
  USING (
    account_id IN (
      SELECT account_id FROM user_accounts WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can insert sessions in their account
CREATE POLICY forge_sessions_insert ON forge_sessions
  FOR INSERT
  WITH CHECK (
    account_id IN (
      SELECT account_id FROM user_accounts WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can update sessions in their account
CREATE POLICY forge_sessions_update ON forge_sessions
  FOR UPDATE
  USING (
    account_id IN (
      SELECT account_id FROM user_accounts WHERE user_id = auth.uid()
    )
  );

-- Add Forge agent type to the default agent personas if not exists
-- This is optional - the agent can also be created via the UI
DO $$
BEGIN
  -- Check if Forge agent type exists for any account
  -- If not, this will be handled by the application code when creating agents
  RAISE NOTICE 'Forge agent migration complete. Forge agents can be created via the UI or API.';
END $$;

-- Add comment for documentation
COMMENT ON TABLE forge_sessions IS 'Tracks Forge agent PRD execution sessions. Each session represents a single PRD being implemented against a codebase.';
COMMENT ON COLUMN forge_sessions.input IS 'JSON containing ForgeTaskInput: prdContent, repositoryPath, baseBranch, etc.';
COMMENT ON COLUMN forge_sessions.output IS 'JSON containing ForgeTaskOutput: commits, filesChanged, testResults, pullRequest, etc.';
COMMENT ON COLUMN forge_sessions.status IS 'Current execution status: initializing -> analyzing -> implementing -> testing -> committing -> pushing -> creating-pr -> completed/failed';
