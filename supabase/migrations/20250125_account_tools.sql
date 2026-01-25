-- Account Tools - Per-account tool configuration
-- Allows accounts to enable/disable tools and configure API keys

-- Account tool configurations
CREATE TABLE IF NOT EXISTS account_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  tool_id TEXT NOT NULL, -- References built-in tool ID or custom tool
  is_enabled BOOLEAN DEFAULT true,
  api_key_encrypted TEXT, -- Encrypted API key for tools that need it
  custom_config JSONB DEFAULT '{}', -- Tool-specific configuration
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id, tool_id)
);

-- Tool execution logs for auditing and analytics
CREATE TABLE IF NOT EXISTS tool_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  task_execution_id UUID REFERENCES task_executions(id) ON DELETE SET NULL,
  tool_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  input_params JSONB,
  output_data JSONB,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  execution_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_account_tools_account ON account_tools(account_id);
CREATE INDEX IF NOT EXISTS idx_account_tools_tool ON account_tools(tool_id);
CREATE INDEX IF NOT EXISTS idx_tool_executions_account ON tool_executions(account_id);
CREATE INDEX IF NOT EXISTS idx_tool_executions_task ON tool_executions(task_execution_id);
CREATE INDEX IF NOT EXISTS idx_tool_executions_created ON tool_executions(created_at);

-- RLS Policies
ALTER TABLE account_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_executions ENABLE ROW LEVEL SECURITY;

-- Account tools: Members can view and manage their account's tools
CREATE POLICY "Account members can view tools" ON account_tools
  FOR SELECT TO authenticated
  USING (
    account_id IN (
      SELECT account_id FROM user_accounts WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Account admins can manage tools" ON account_tools
  FOR ALL TO authenticated
  USING (
    account_id IN (
      SELECT account_id FROM user_accounts
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    account_id IN (
      SELECT account_id FROM user_accounts
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Tool executions: Members can view their account's tool executions
CREATE POLICY "Account members can view tool executions" ON tool_executions
  FOR SELECT TO authenticated
  USING (
    account_id IN (
      SELECT account_id FROM user_accounts WHERE user_id = auth.uid()
    )
  );

-- Insert-only for service (executions created by system)
CREATE POLICY "System can insert tool executions" ON tool_executions
  FOR INSERT TO authenticated
  WITH CHECK (
    account_id IN (
      SELECT account_id FROM user_accounts WHERE user_id = auth.uid()
    )
  );

-- Updated at trigger for account_tools
CREATE OR REPLACE FUNCTION update_account_tools_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER account_tools_updated_at
  BEFORE UPDATE ON account_tools
  FOR EACH ROW
  EXECUTE FUNCTION update_account_tools_updated_at();

-- Function to increment tool usage count
CREATE OR REPLACE FUNCTION increment_tool_usage(p_account_id UUID, p_tool_id TEXT)
RETURNS void AS $$
BEGIN
  INSERT INTO account_tools (account_id, tool_id, usage_count, last_used_at)
  VALUES (p_account_id, p_tool_id, 1, NOW())
  ON CONFLICT (account_id, tool_id)
  DO UPDATE SET
    usage_count = account_tools.usage_count + 1,
    last_used_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
