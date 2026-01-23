-- =============================================================================
-- FIX AGENTS: Dashboard visibility and hierarchy
-- Date: 2025-01-23
-- =============================================================================

-- Step 1: Hide secondary agents from dashboard (keep 5 core agents visible)
-- Core 5: Atlas (orchestrator), Maverick (content), Pixel (image), Scout (research), Forge (developer)
-- Hidden: Radar, Scribe, Herald, Sentinel
UPDATE agent_personas
SET show_on_dashboard = false
WHERE alias IN ('Radar', 'Scribe', 'Herald', 'Sentinel');

-- Step 2: Fix hierarchy - all workers report to orchestrator
DO $$
DECLARE
  rec RECORD;
  orch_id UUID;
  orch_alias TEXT;
BEGIN
  -- For each account that has an orchestrator
  FOR rec IN
    SELECT DISTINCT account_id FROM agent_personas WHERE deleted_at IS NULL
  LOOP
    -- Find the orchestrator for this account
    SELECT id, alias INTO orch_id, orch_alias
    FROM agent_personas
    WHERE account_id = rec.account_id
      AND agent_type = 'orchestrator'
      AND deleted_at IS NULL
    LIMIT 1;

    IF orch_id IS NOT NULL THEN
      -- Set orchestrator to report to user (top of hierarchy)
      UPDATE agent_personas
      SET reports_to = jsonb_build_object('type', 'user')
      WHERE id = orch_id;

      -- Set all other agents to report to orchestrator
      UPDATE agent_personas
      SET reports_to = jsonb_build_object('type', 'agent', 'id', orch_id::text, 'name', orch_alias)
      WHERE account_id = rec.account_id
        AND id != orch_id
        AND deleted_at IS NULL;

      RAISE NOTICE 'Fixed hierarchy for account %: orchestrator % (%)', rec.account_id, orch_alias, orch_id;
    END IF;
  END LOOP;
END $$;

-- Verify the results
DO $$
DECLARE
  visible_count INT;
  hierarchy_ok BOOLEAN;
BEGIN
  -- Count visible agents for funnelists
  SELECT COUNT(*) INTO visible_count
  FROM agent_personas ap
  JOIN accounts a ON ap.account_id = a.id
  WHERE LOWER(a.name) = 'funnelists'
    AND ap.show_on_dashboard = true
    AND ap.deleted_at IS NULL;

  -- Check hierarchy - should have exactly 1 agent reporting to user
  SELECT COUNT(*) = 1 INTO hierarchy_ok
  FROM agent_personas ap
  JOIN accounts a ON ap.account_id = a.id
  WHERE LOWER(a.name) = 'funnelists'
    AND (ap.reports_to->>'type' = 'user' OR ap.reports_to IS NULL AND ap.agent_type = 'orchestrator')
    AND ap.deleted_at IS NULL;

  RAISE NOTICE 'Funnelists: % visible agents (should be 5), hierarchy OK: %', visible_count, hierarchy_ok;
END $$;
