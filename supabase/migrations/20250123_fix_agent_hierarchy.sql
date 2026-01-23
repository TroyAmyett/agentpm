-- Fix agent hierarchy: Worker agents should report to the orchestrator
-- Orchestrator reports to user (null/user type reportsTo), others report to orchestrator

-- First, get orchestrator's ID for the funnelists account
DO $$
DECLARE
  orchestrator_id UUID;
  orchestrator_alias TEXT;
  funnelists_account_id UUID;
BEGIN
  -- Get funnelists account
  SELECT id INTO funnelists_account_id FROM accounts WHERE name = 'funnelists' LIMIT 1;

  IF funnelists_account_id IS NULL THEN
    RAISE NOTICE 'funnelists account not found, skipping';
    RETURN;
  END IF;

  -- Get orchestrator agent ID and name (may be named Dispatch, Atlas, or other)
  SELECT id, alias INTO orchestrator_id, orchestrator_alias
  FROM agent_personas
  WHERE account_id = funnelists_account_id
    AND agent_type = 'orchestrator'
  LIMIT 1;

  IF orchestrator_id IS NULL THEN
    RAISE NOTICE 'Orchestrator agent not found, skipping';
    RETURN;
  END IF;

  RAISE NOTICE 'Setting worker agents to report to orchestrator % (%)', orchestrator_alias, orchestrator_id;

  -- Update all non-orchestrator agents to report to the orchestrator
  UPDATE agent_personas
  SET reports_to = jsonb_build_object('type', 'agent', 'id', orchestrator_id::text, 'name', orchestrator_alias)
  WHERE account_id = funnelists_account_id
    AND agent_type != 'orchestrator'
    AND agent_type != 'forge';  -- Forge might be special

  -- Ensure orchestrator reports to user (top of hierarchy)
  UPDATE agent_personas
  SET reports_to = jsonb_build_object('type', 'user')
  WHERE id = orchestrator_id;
  
  RAISE NOTICE 'Agent hierarchy updated successfully';
END $$;
