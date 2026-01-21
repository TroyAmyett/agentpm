-- Seed Default Agent Personas
-- Creates the default agents with fixed UUIDs so they work with task assignment

-- Note: We use a function to get the first account or create a demo one
-- In production, agents should be created per-account when the account is created

DO $$
DECLARE
  target_account_id UUID;
  system_user_id UUID := '00000000-0000-0000-0000-000000000000';
BEGIN
  -- Get the first available account
  SELECT id INTO target_account_id FROM accounts LIMIT 1;

  -- If no account exists, we can't seed agents (they need an account)
  IF target_account_id IS NULL THEN
    RAISE NOTICE 'No accounts found. Skipping agent seeding. Agents will be created when first account is created.';
    RETURN;
  END IF;

  -- Insert default agents with fixed UUIDs
  -- These match the UUIDs in src/stores/agentStore.ts DEMO_AGENT_UUIDS

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
    '00000000-0000-0000-0000-000000000001',
    target_account_id,
    'content-writer',
    'Maverick',
    'Your content autopilot',
    ARRAY['web-research', 'write-content', 'generate-images', 'post-to-cms'],
    ARRAY['edit-production', 'delete-records'],
    ARRAY['manual', 'task-queue'],
    'semi-autonomous',
    ARRAY['publish', 'delete', 'send-email'],
    FALSE, FALSE,
    0, 5, 'healthy',
    TRUE, TRUE, TRUE, 1,
    system_user_id, 'agent', system_user_id, 'agent'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    target_account_id,
    'image-generator',
    'Pixel',
    'On-brand visuals, instantly',
    ARRAY['generate-images', 'edit-images'],
    ARRAY['delete-records'],
    ARRAY['manual', 'task-queue'],
    'semi-autonomous',
    ARRAY['publish'],
    FALSE, FALSE,
    0, 5, 'healthy',
    TRUE, TRUE, TRUE, 2,
    system_user_id, 'agent', system_user_id, 'agent'
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    target_account_id,
    'researcher',
    'Scout',
    'Intel on demand',
    ARRAY['web-research', 'summarize', 'report'],
    ARRAY['write-content', 'publish'],
    ARRAY['manual', 'task-queue'],
    'autonomous',
    ARRAY[]::TEXT[],
    FALSE, FALSE,
    0, 5, 'healthy',
    TRUE, TRUE, TRUE, 3,
    system_user_id, 'agent', system_user_id, 'agent'
  ),
  (
    '00000000-0000-0000-0000-000000000004',
    target_account_id,
    'qa-tester',
    'Sentinel',
    'Quality guardian',
    ARRAY['test', 'validate', 'report-issues'],
    ARRAY['write-content', 'publish'],
    ARRAY['manual', 'task-queue', 'schedule:daily'],
    'autonomous',
    ARRAY[]::TEXT[],
    FALSE, FALSE,
    0, 5, 'healthy',
    TRUE, TRUE, TRUE, 4,
    system_user_id, 'agent', system_user_id, 'agent'
  ),
  (
    '00000000-0000-0000-0000-000000000005',
    target_account_id,
    'orchestrator',
    'Dispatch',
    'Mission control',
    ARRAY['route-tasks', 'coordinate-agents', 'monitor'],
    ARRAY['write-content', 'publish'],
    ARRAY['task-queue', 'schedule:hourly'],
    'semi-autonomous',
    ARRAY['spawn-agent'],
    FALSE, FALSE,
    0, 5, 'healthy',
    TRUE, TRUE, TRUE, 5,
    system_user_id, 'agent', system_user_id, 'agent'
  )
  ON CONFLICT (id) DO UPDATE SET
    alias = EXCLUDED.alias,
    tagline = EXCLUDED.tagline,
    capabilities = EXCLUDED.capabilities,
    updated_at = NOW();

  RAISE NOTICE 'Seeded % default agents for account %', 5, target_account_id;
END $$;
