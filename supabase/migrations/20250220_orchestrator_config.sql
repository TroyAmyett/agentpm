-- Orchestrator Autonomous Execution — Phase 1A
-- orchestrator_config table, depends_on column, cancel_task_tree function

-- ============================================================================
-- 1. ORCHESTRATOR CONFIG TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS orchestrator_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- Which agent acts as orchestrator
  orchestrator_agent_id UUID NOT NULL REFERENCES agent_personas(id),

  -- Decomposition
  max_decomposition_depth INTEGER NOT NULL DEFAULT 1,
  auto_decompose BOOLEAN NOT NULL DEFAULT false,

  -- Trust levels per category (0=supervised, 1=guided, 2=trusted, 3=autonomous)
  trust_task_execution INTEGER NOT NULL DEFAULT 0 CHECK (trust_task_execution BETWEEN 0 AND 3),
  trust_decomposition INTEGER NOT NULL DEFAULT 0 CHECK (trust_decomposition BETWEEN 0 AND 3),
  trust_skill_creation INTEGER NOT NULL DEFAULT 0 CHECK (trust_skill_creation BETWEEN 0 AND 3),
  trust_tool_usage INTEGER NOT NULL DEFAULT 0 CHECK (trust_tool_usage BETWEEN 0 AND 3),
  trust_content_publishing INTEGER NOT NULL DEFAULT 0 CHECK (trust_content_publishing BETWEEN 0 AND 3),
  trust_external_actions INTEGER NOT NULL DEFAULT 0 CHECK (trust_external_actions BETWEEN 0 AND 3),
  trust_spending INTEGER NOT NULL DEFAULT 0 CHECK (trust_spending BETWEEN 0 AND 3),
  trust_agent_creation INTEGER NOT NULL DEFAULT 0 CHECK (trust_agent_creation BETWEEN 0 AND 3),

  -- Hard limits (non-overridable ceilings)
  max_subtasks_per_parent INTEGER NOT NULL DEFAULT 10,
  max_total_active_tasks INTEGER NOT NULL DEFAULT 25,
  max_cost_per_task_cents INTEGER NOT NULL DEFAULT 500,       -- $5.00 default
  max_concurrent_agents INTEGER NOT NULL DEFAULT 4,
  max_retries_per_subtask INTEGER NOT NULL DEFAULT 3,

  -- Spending limits
  monthly_spend_budget_cents INTEGER NOT NULL DEFAULT 0,      -- 0 = no auto-spend

  -- Behavior
  post_mortem_enabled BOOLEAN NOT NULL DEFAULT true,
  post_mortem_parent_only BOOLEAN NOT NULL DEFAULT true,
  post_mortem_cost_threshold_cents INTEGER NOT NULL DEFAULT 10,
  dry_run_default BOOLEAN NOT NULL DEFAULT true,
  auto_route_root_tasks BOOLEAN NOT NULL DEFAULT false,
  auto_retry_on_failure BOOLEAN NOT NULL DEFAULT false,
  notify_on_completion BOOLEAN NOT NULL DEFAULT true,

  -- LLM model strategy
  model_triage TEXT NOT NULL DEFAULT 'haiku',
  model_decomposition TEXT NOT NULL DEFAULT 'sonnet',
  model_review TEXT NOT NULL DEFAULT 'sonnet',
  model_post_mortem TEXT NOT NULL DEFAULT 'opus',
  model_skill_generation TEXT NOT NULL DEFAULT 'opus',

  -- Orchestrator memory / preferences
  preferences JSONB NOT NULL DEFAULT '{}',

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  created_by_type TEXT DEFAULT 'user',
  updated_by UUID,
  updated_by_type TEXT DEFAULT 'user',
  deleted_at TIMESTAMPTZ,

  UNIQUE(account_id)
);

COMMENT ON TABLE orchestrator_config IS
  'Per-account orchestrator settings: trust levels, hard limits, model strategy, behavior flags';

-- RLS
ALTER TABLE orchestrator_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own account orchestrator_config" ON orchestrator_config;
CREATE POLICY "Users can manage own account orchestrator_config" ON orchestrator_config
  FOR ALL USING (
    account_id IN (SELECT account_id FROM user_accounts WHERE user_id = auth.uid())
  );

-- Service role bypass
DROP POLICY IF EXISTS "Service role full access on orchestrator_config" ON orchestrator_config;
CREATE POLICY "Service role full access on orchestrator_config" ON orchestrator_config
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- 2. ADD depends_on TO TASKS
-- ============================================================================

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS depends_on UUID[] DEFAULT '{}';

COMMENT ON COLUMN tasks.depends_on IS
  'Array of task IDs that must complete before this task can start';

CREATE INDEX IF NOT EXISTS idx_tasks_depends_on ON tasks USING gin(depends_on);

-- ============================================================================
-- 3. CANCEL TASK TREE FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION cancel_task_tree(
  root_id UUID,
  cancelled_by UUID DEFAULT NULL,
  cancelled_by_type TEXT DEFAULT 'user'
)
RETURNS INTEGER AS $$
DECLARE
  affected INTEGER;
BEGIN
  WITH RECURSIVE task_tree AS (
    -- Anchor: the root task itself
    SELECT id FROM tasks WHERE id = root_id
    UNION ALL
    -- Recursive: all children
    SELECT t.id FROM tasks t
    INNER JOIN task_tree tt ON t.parent_task_id = tt.id
    WHERE t.status NOT IN ('completed', 'cancelled')
      AND t.deleted_at IS NULL
  )
  UPDATE tasks SET
    status = 'cancelled',
    updated_at = now(),
    updated_by = COALESCE(cancelled_by, updated_by),
    updated_by_type = COALESCE(cancelled_by_type, updated_by_type),
    status_history = COALESCE(status_history, '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'status', 'cancelled',
        'changedAt', now()::text,
        'changedBy', COALESCE(cancelled_by::text, 'system'),
        'changedByType', COALESCE(cancelled_by_type, 'system'),
        'note', 'Cancelled via cancel_task_tree'
      )
    )
  WHERE id IN (SELECT id FROM task_tree)
    AND status NOT IN ('completed', 'cancelled');

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION cancel_task_tree IS
  'Recursively cancel a task and all its descendants. Returns count of tasks cancelled.';

-- ============================================================================
-- 4. SEED DEFAULT CONFIG FOR FUNNELISTS ACCOUNT
-- ============================================================================

-- Insert default orchestrator config for the Funnelists account
-- Uses the seeded Atlas agent ID
INSERT INTO orchestrator_config (
  account_id,
  orchestrator_agent_id,
  dry_run_default,
  auto_route_root_tasks
)
SELECT
  ua.account_id,
  '00000000-0000-0000-0000-000000000011'::uuid,
  true,
  false
FROM user_accounts ua
WHERE ua.user_id = (SELECT id FROM auth.users WHERE email = 'troy@funnelists.com' LIMIT 1)
LIMIT 1
ON CONFLICT (account_id) DO NOTHING;
