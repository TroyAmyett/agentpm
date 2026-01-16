-- Queue API Helper Functions
-- Date: 2025-01-16

-- =============================================================================
-- FUNCTION: Increment API key request count
-- =============================================================================

CREATE OR REPLACE FUNCTION increment_api_key_requests(key_prefix_param TEXT)
RETURNS INTEGER AS $$
DECLARE
  new_count INTEGER;
BEGIN
  UPDATE agent_api_keys
  SET total_requests = total_requests + 1
  WHERE key_prefix = key_prefix_param
  RETURNING total_requests INTO new_count;

  RETURN COALESCE(new_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- FUNCTION: Update agent stats on task completion
-- =============================================================================

CREATE OR REPLACE FUNCTION update_agent_stats_on_completion(
  p_agent_id UUID,
  p_success BOOLEAN
)
RETURNS VOID AS $$
BEGIN
  UPDATE agent_personas
  SET stats = jsonb_set(
    jsonb_set(
      jsonb_set(
        stats,
        '{tasksCompleted}',
        to_jsonb(COALESCE((stats->>'tasksCompleted')::integer, 0) + CASE WHEN p_success THEN 1 ELSE 0 END)
      ),
      '{tasksFailed}',
      to_jsonb(COALESCE((stats->>'tasksFailed')::integer, 0) + CASE WHEN NOT p_success THEN 1 ELSE 0 END)
    ),
    '{lastRunAt}',
    to_jsonb(NOW())
  ),
  -- Reset consecutive failures on success
  consecutive_failures = CASE WHEN p_success THEN 0 ELSE consecutive_failures END,
  -- Update health check
  last_health_check = NOW()
  WHERE id = p_agent_id;

  -- Recalculate success rate
  UPDATE agent_personas
  SET stats = jsonb_set(
    stats,
    '{successRate}',
    to_jsonb(
      CASE
        WHEN COALESCE((stats->>'tasksCompleted')::integer, 0) + COALESCE((stats->>'tasksFailed')::integer, 0) = 0
        THEN 100
        ELSE ROUND(
          (COALESCE((stats->>'tasksCompleted')::integer, 0)::numeric /
           (COALESCE((stats->>'tasksCompleted')::integer, 0) + COALESCE((stats->>'tasksFailed')::integer, 0))::numeric) * 100
        )
      END
    )
  )
  WHERE id = p_agent_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- FUNCTION: Increment agent consecutive failures
-- =============================================================================

CREATE OR REPLACE FUNCTION increment_agent_failures(p_agent_id UUID)
RETURNS VOID AS $$
DECLARE
  current_failures INTEGER;
  max_failures INTEGER;
BEGIN
  SELECT consecutive_failures, max_consecutive_failures
  INTO current_failures, max_failures
  FROM agent_personas
  WHERE id = p_agent_id;

  -- Increment failures
  UPDATE agent_personas
  SET
    consecutive_failures = current_failures + 1,
    -- Auto-pause if max failures reached
    health_status = CASE
      WHEN current_failures + 1 >= max_failures THEN 'failing'
      WHEN current_failures + 1 >= (max_failures / 2) THEN 'degraded'
      ELSE health_status
    END,
    -- Auto-pause agent if max failures exceeded
    is_active = CASE
      WHEN current_failures + 1 >= max_failures THEN FALSE
      ELSE is_active
    END,
    paused_at = CASE
      WHEN current_failures + 1 >= max_failures THEN NOW()
      ELSE paused_at
    END,
    pause_reason = CASE
      WHEN current_failures + 1 >= max_failures THEN 'Auto-paused: exceeded max consecutive failures'
      ELSE pause_reason
    END
  WHERE id = p_agent_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- FUNCTION: Queue a task for agent execution
-- =============================================================================

CREATE OR REPLACE FUNCTION queue_task_for_agent(
  p_task_id UUID,
  p_agent_type TEXT,
  p_queued_by UUID,
  p_queued_by_type TEXT DEFAULT 'user'
)
RETURNS VOID AS $$
DECLARE
  current_task RECORD;
BEGIN
  -- Get current task
  SELECT * INTO current_task
  FROM tasks
  WHERE id = p_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  -- Update task status to queued
  UPDATE tasks
  SET
    status = 'queued',
    queued_at = NOW(),
    assigned_agent = p_agent_type,
    assigned_to_type = 'agent',
    status_history = COALESCE(current_task.status_history, '[]'::jsonb) || jsonb_build_object(
      'status', 'queued',
      'changedAt', NOW(),
      'changedBy', p_queued_by,
      'changedByType', p_queued_by_type,
      'note', 'Queued for agent: ' || p_agent_type
    ),
    updated_by = p_queued_by,
    updated_by_type = p_queued_by_type
  WHERE id = p_task_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- FUNCTION: Get next available task for agent
-- =============================================================================

CREATE OR REPLACE FUNCTION get_next_task_for_agent(
  p_agent_type TEXT,
  p_account_id UUID DEFAULT NULL
)
RETURNS TABLE (
  task_id UUID,
  task_title TEXT,
  task_priority TEXT,
  task_input JSONB,
  account_id UUID,
  account_name TEXT,
  account_config JSONB,
  project_id UUID,
  project_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id AS task_id,
    t.title AS task_title,
    t.priority AS task_priority,
    t.input AS task_input,
    t.account_id,
    a.name AS account_name,
    a.config AS account_config,
    t.project_id,
    p.name AS project_name
  FROM tasks t
  JOIN accounts a ON a.id = t.account_id
  LEFT JOIN projects p ON p.id = t.project_id
  WHERE t.status = 'queued'
    AND t.deleted_at IS NULL
    AND t.assigned_agent = p_agent_type
    AND (p_account_id IS NULL OR t.account_id = p_account_id)
  ORDER BY
    CASE t.priority
      WHEN 'critical' THEN 1
      WHEN 'high' THEN 2
      WHEN 'medium' THEN 3
      WHEN 'low' THEN 4
    END,
    t.created_at ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- VIEW: Queued tasks with full context
-- =============================================================================

CREATE OR REPLACE VIEW v_queued_tasks AS
SELECT
  t.id,
  t.title,
  t.description,
  t.priority,
  t.status,
  t.assigned_agent,
  t.input,
  t.queued_at,
  t.created_at,
  t.account_id,
  a.name AS account_name,
  a.slug AS account_slug,
  a.config AS account_config,
  t.project_id,
  p.name AS project_name,
  t.milestone_id,
  m.name AS milestone_name
FROM tasks t
JOIN accounts a ON a.id = t.account_id
LEFT JOIN projects p ON p.id = t.project_id
LEFT JOIN milestones m ON m.id = t.milestone_id
WHERE t.status = 'queued'
  AND t.deleted_at IS NULL
ORDER BY
  CASE t.priority
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    WHEN 'low' THEN 4
  END,
  t.created_at ASC;

-- Grant access to service role
GRANT EXECUTE ON FUNCTION increment_api_key_requests TO service_role;
GRANT EXECUTE ON FUNCTION update_agent_stats_on_completion TO service_role;
GRANT EXECUTE ON FUNCTION increment_agent_failures TO service_role;
GRANT EXECUTE ON FUNCTION queue_task_for_agent TO service_role;
GRANT EXECUTE ON FUNCTION get_next_task_for_agent TO service_role;
GRANT SELECT ON v_queued_tasks TO service_role;
