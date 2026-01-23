-- Cleanup: Set show_on_dashboard = false for secondary agents
-- Keep core 5: Atlas (orchestrator), Maverick (content), Pixel (image), Scout (research), Forge (developer)

UPDATE agent_personas
SET show_on_dashboard = false
WHERE alias IN ('Radar', 'Scribe', 'Herald', 'Sentinel')
  AND account_id = (SELECT id FROM accounts WHERE name = 'funnelists' LIMIT 1);

-- Also run the hierarchy fix while we're at it
DO $$
DECLARE
  orchestrator_id UUID;
  orchestrator_alias TEXT;
  funnelists_account_id UUID;
BEGIN
  SELECT id INTO funnelists_account_id FROM accounts WHERE name = 'funnelists' LIMIT 1;
  IF funnelists_account_id IS NULL THEN RETURN; END IF;

  SELECT id, alias INTO orchestrator_id, orchestrator_alias
  FROM agent_personas
  WHERE account_id = funnelists_account_id AND agent_type = 'orchestrator'
  LIMIT 1;
  IF orchestrator_id IS NULL THEN RETURN; END IF;

  -- Workers report to orchestrator
  UPDATE agent_personas
  SET reports_to = jsonb_build_object('type', 'agent', 'id', orchestrator_id::text, 'name', orchestrator_alias)
  WHERE account_id = funnelists_account_id
    AND agent_type NOT IN ('orchestrator', 'forge');

  -- Orchestrator reports to user
  UPDATE agent_personas
  SET reports_to = jsonb_build_object('type', 'user')
  WHERE id = orchestrator_id;
END $$;
