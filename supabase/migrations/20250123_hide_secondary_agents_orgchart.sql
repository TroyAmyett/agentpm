-- Hide secondary agents from OrgChart as well (already hidden from dashboard)
-- Also check for and clean up duplicate agents

-- Step 1: Hide from org chart
UPDATE agent_personas
SET show_in_org_chart = false
WHERE alias IN ('Radar', 'Scribe', 'Herald', 'Sentinel');

-- Step 2: Check for duplicate agents by alias within same account
DO $$
DECLARE
  dup RECORD;
BEGIN
  FOR dup IN
    SELECT account_id, alias, COUNT(*) as cnt, array_agg(id ORDER BY created_at) as ids
    FROM agent_personas
    WHERE deleted_at IS NULL
    GROUP BY account_id, alias
    HAVING COUNT(*) > 1
  LOOP
    RAISE NOTICE 'Duplicate found: % has % copies in account %', dup.alias, dup.cnt, dup.account_id;
    RAISE NOTICE 'IDs: %', dup.ids;

    -- Keep the first (oldest), soft-delete the rest
    UPDATE agent_personas
    SET deleted_at = NOW()
    WHERE id = ANY(dup.ids[2:])
      AND deleted_at IS NULL;

    RAISE NOTICE 'Soft-deleted duplicates for %', dup.alias;
  END LOOP;
END $$;

-- Verify
SELECT alias, show_on_dashboard, show_in_org_chart
FROM agent_personas
WHERE deleted_at IS NULL
ORDER BY alias;
