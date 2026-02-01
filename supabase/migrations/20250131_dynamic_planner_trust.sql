-- Dynamic Planner & Self-Annealing Trust Management
-- Phase 3: Trust engine, pattern learning, confidence-based execution

-- =============================================================================
-- EXTEND AGENT_PERSONAS: Trust management columns
-- =============================================================================

ALTER TABLE agent_personas ADD COLUMN IF NOT EXISTS autonomy_override TEXT
  CHECK (autonomy_override IN ('supervised', 'semi-autonomous', 'autonomous'));
ALTER TABLE agent_personas ADD COLUMN IF NOT EXISTS autonomy_override_by UUID;
ALTER TABLE agent_personas ADD COLUMN IF NOT EXISTS autonomy_override_at TIMESTAMPTZ;
ALTER TABLE agent_personas ADD COLUMN IF NOT EXISTS consecutive_successes INTEGER DEFAULT 0;
ALTER TABLE agent_personas ADD COLUMN IF NOT EXISTS last_execution_at TIMESTAMPTZ;

-- =============================================================================
-- EXTEND TASK_EXECUTIONS: Pattern tracking + cost
-- =============================================================================

ALTER TABLE task_executions ADD COLUMN IF NOT EXISTS plan_pattern_key TEXT;
ALTER TABLE task_executions ADD COLUMN IF NOT EXISTS tools_used JSONB DEFAULT '[]';
ALTER TABLE task_executions ADD COLUMN IF NOT EXISTS cost_cents INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_task_executions_plan_pattern
  ON task_executions(plan_pattern_key) WHERE plan_pattern_key IS NOT NULL;

-- =============================================================================
-- PLAN PATTERNS TABLE (Self-annealing memory)
-- Tracks which plan patterns work and which don't per account
-- =============================================================================

CREATE TABLE IF NOT EXISTS plan_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- Pattern identity
  pattern_key TEXT NOT NULL,        -- Hash of sorted agent_types + tool_combos + step_count
  goal_category TEXT,               -- 'content', 'research', 'code', etc.

  -- Execution stats
  total_executions INTEGER DEFAULT 0,
  successful_executions INTEGER DEFAULT 0,
  success_rate DECIMAL(5,4) DEFAULT 0,
  avg_duration_ms INTEGER DEFAULT 0,
  avg_cost_cents INTEGER DEFAULT 0,

  -- Pattern details
  agent_types TEXT[] DEFAULT '{}',
  tools_used TEXT[] DEFAULT '{}',
  step_count INTEGER DEFAULT 1,

  -- Last execution
  last_executed_at TIMESTAMPTZ,
  last_success BOOLEAN,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(account_id, pattern_key)
);

CREATE INDEX IF NOT EXISTS idx_plan_patterns_account ON plan_patterns(account_id);
CREATE INDEX IF NOT EXISTS idx_plan_patterns_key ON plan_patterns(pattern_key);
CREATE INDEX IF NOT EXISTS idx_plan_patterns_success ON plan_patterns(success_rate DESC);

-- RLS for plan_patterns
ALTER TABLE plan_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plan_patterns_select" ON plan_patterns
  FOR SELECT USING (account_id IN (
    SELECT account_id FROM user_accounts WHERE user_id = auth.uid()
  ));

CREATE POLICY "plan_patterns_insert" ON plan_patterns
  FOR INSERT WITH CHECK (account_id IN (
    SELECT account_id FROM user_accounts WHERE user_id = auth.uid()
  ));

CREATE POLICY "plan_patterns_update" ON plan_patterns
  FOR UPDATE USING (account_id IN (
    SELECT account_id FROM user_accounts WHERE user_id = auth.uid()
  ));

-- =============================================================================
-- TRIGGER: Compute real agent stats from task_executions
-- Replaces the random placeholder values with actual computed metrics
-- =============================================================================

CREATE OR REPLACE FUNCTION update_agent_stats_from_executions()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE agent_personas SET
    stats = (
      SELECT jsonb_build_object(
        'tasksCompleted', COUNT(*) FILTER (WHERE status = 'completed'),
        'tasksFailed', COUNT(*) FILTER (WHERE status = 'failed'),
        'successRate', CASE
          WHEN COUNT(*) FILTER (WHERE status IN ('completed','failed')) = 0 THEN 100
          ELSE ROUND(
            (COUNT(*) FILTER (WHERE status = 'completed')::numeric /
             NULLIF(COUNT(*) FILTER (WHERE status IN ('completed','failed')), 0)::numeric) * 100
          )
        END,
        'avgExecutionTime', COALESCE(ROUND(AVG(
          EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000
        ) FILTER (WHERE completed_at IS NOT NULL AND started_at IS NOT NULL)), 0),
        'lastRunAt', MAX(created_at),
        'totalCost', COALESCE(SUM(cost_cents), 0)
      )
      FROM task_executions
      WHERE agent_id = NEW.agent_id
        AND status IN ('completed', 'failed')
    ),
    last_execution_at = NOW()
  WHERE id = NEW.agent_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop if exists to allow re-run
DROP TRIGGER IF EXISTS update_agent_stats_on_execution ON task_executions;

CREATE TRIGGER update_agent_stats_on_execution
  AFTER INSERT OR UPDATE OF status ON task_executions
  FOR EACH ROW
  WHEN (NEW.status IN ('completed', 'failed'))
  EXECUTE FUNCTION update_agent_stats_from_executions();

-- =============================================================================
-- Auto-update updated_at for plan_patterns
-- =============================================================================

DROP TRIGGER IF EXISTS update_plan_patterns_updated_at ON plan_patterns;

CREATE TRIGGER update_plan_patterns_updated_at
  BEFORE UPDATE ON plan_patterns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
