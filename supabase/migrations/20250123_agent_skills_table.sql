-- =============================================================================
-- AGENT SKILLS JOIN TABLE
-- Date: 2025-01-23
-- Purpose: Proper many-to-many relationship between agents and skills
-- =============================================================================

-- Create agent_skills join table
CREATE TABLE IF NOT EXISTS agent_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agent_personas(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,

  -- Relationship config
  is_default BOOLEAN DEFAULT false,
  is_enabled BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,  -- Higher = preferred for ambiguous matches

  -- Per-agent-skill overrides (optional)
  custom_config JSONB DEFAULT '{}',
  /*
    Example:
    {
      "temperature": 0.9,
      "max_tokens": 2000,
      "custom_instructions": "Always use casual tone",
      "input_defaults": { "tone": "casual" }
    }
  */

  -- Stats
  usage_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  avg_execution_time_ms INTEGER,
  last_used_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(agent_id, skill_id)
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_agent_skills_agent
  ON agent_skills(agent_id) WHERE is_enabled = true;

CREATE INDEX IF NOT EXISTS idx_agent_skills_default
  ON agent_skills(agent_id) WHERE is_default = true;

-- Ensure only one default per agent
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_skills_one_default
  ON agent_skills(agent_id)
  WHERE is_default = true;

-- Enable RLS
ALTER TABLE agent_skills ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can see agent_skills for agents in their account
CREATE POLICY "Users can view agent_skills for their account agents"
  ON agent_skills FOR SELECT
  USING (
    agent_id IN (
      SELECT id FROM agent_personas
      WHERE account_id IN (
        SELECT account_id FROM user_accounts WHERE user_id = auth.uid()
      )
    )
  );

-- RLS policy: users can manage agent_skills for their account agents
CREATE POLICY "Users can manage agent_skills for their account agents"
  ON agent_skills FOR ALL
  USING (
    agent_id IN (
      SELECT id FROM agent_personas
      WHERE account_id IN (
        SELECT account_id FROM user_accounts WHERE user_id = auth.uid()
      )
    )
  );

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_agent_skills_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agent_skills_updated_at
  BEFORE UPDATE ON agent_skills
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_skills_updated_at();

-- =============================================================================
-- HELPER FUNCTION: Update usage stats after execution
-- =============================================================================
CREATE OR REPLACE FUNCTION update_agent_skill_stats(
  p_agent_id UUID,
  p_skill_id UUID,
  p_success BOOLEAN,
  p_execution_time_ms INTEGER
)
RETURNS VOID AS $$
BEGIN
  UPDATE agent_skills
  SET
    usage_count = usage_count + 1,
    success_count = success_count + CASE WHEN p_success THEN 1 ELSE 0 END,
    failure_count = failure_count + CASE WHEN p_success THEN 0 ELSE 1 END,
    avg_execution_time_ms = COALESCE(
      (avg_execution_time_ms * usage_count + p_execution_time_ms) / (usage_count + 1),
      p_execution_time_ms
    ),
    last_used_at = now(),
    updated_at = now()
  WHERE agent_id = p_agent_id AND skill_id = p_skill_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
