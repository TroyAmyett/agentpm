-- Add Atlas (CMS Publisher) Agent
-- Atlas handles publishing content to the Funnelists CMS

DO $$
DECLARE
  target_account_id UUID;
  system_user_id UUID := '00000000-0000-0000-0000-000000000000';
BEGIN
  -- Get the first available account
  SELECT id INTO target_account_id FROM accounts LIMIT 1;

  -- If no account exists, skip
  IF target_account_id IS NULL THEN
    RAISE NOTICE 'No accounts found. Skipping Atlas agent creation.';
    RETURN;
  END IF;

  -- Insert Atlas - CMS Publisher agent
  INSERT INTO agent_personas (
    id, account_id, agent_type, alias, tagline,
    capabilities, restrictions, triggers,
    autonomy_level, requires_approval,
    can_spawn_agents, can_modify_self,
    consecutive_failures, max_consecutive_failures, health_status,
    is_active, show_on_dashboard, show_in_org_chart, sort_order,
    created_by, created_by_type, updated_by, updated_by_type
  ) VALUES
  (
    '00000000-0000-0000-0000-000000000006',
    target_account_id,
    'cms-publisher',
    'Atlas',
    'Publishes to the world',
    ARRAY['validate-content', 'post-to-cms', 'update-cms', 'schedule-posts'],
    ARRAY['delete-posts', 'modify-production'],
    ARRAY['manual', 'task-queue'],
    'semi-autonomous',
    ARRAY['publish', 'delete'],
    FALSE, FALSE,
    0, 5, 'healthy',
    TRUE, TRUE, TRUE, 6,
    system_user_id, 'agent', system_user_id, 'agent'
  )
  ON CONFLICT (id) DO UPDATE SET
    alias = EXCLUDED.alias,
    tagline = EXCLUDED.tagline,
    agent_type = EXCLUDED.agent_type,
    capabilities = EXCLUDED.capabilities,
    updated_at = NOW();

  RAISE NOTICE 'Added Atlas (CMS Publisher) agent for account %', target_account_id;
END $$;
