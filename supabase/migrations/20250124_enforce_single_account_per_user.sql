-- =============================================================================
-- ENFORCE SINGLE ACCOUNT PER USER
-- Each email/user can only belong to ONE account
-- If you want a separate personal account, use a different email
-- =============================================================================

-- Step 1: Remove duplicate user_accounts entries (keep primary or first created)
-- This handles existing data where users might be in multiple accounts
WITH duplicates AS (
  SELECT
    id,
    user_id,
    account_id,
    is_primary,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY is_primary DESC, created_at ASC
    ) as rn
  FROM user_accounts
)
DELETE FROM user_accounts
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Step 2: Add UNIQUE constraint on user_id
-- This ensures each user can only be in ONE account
ALTER TABLE user_accounts
ADD CONSTRAINT user_accounts_user_id_unique UNIQUE (user_id);

-- Step 3: Update RLS policies to be simpler (user can only see their ONE account)
-- Drop existing overly permissive policies and recreate with stricter rules

-- For agent_personas: simplify to direct account match
DROP POLICY IF EXISTS "Users can view agents for their accounts" ON agent_personas;
CREATE POLICY "Users can view agents for their account"
  ON agent_personas FOR SELECT
  USING (
    account_id = (
      SELECT account_id FROM user_accounts WHERE user_id = auth.uid() LIMIT 1
    )
  );

DROP POLICY IF EXISTS "Users can insert agents for their accounts" ON agent_personas;
CREATE POLICY "Users can insert agents for their account"
  ON agent_personas FOR INSERT
  WITH CHECK (
    account_id = (
      SELECT account_id FROM user_accounts WHERE user_id = auth.uid() LIMIT 1
    )
  );

DROP POLICY IF EXISTS "Users can update agents for their accounts" ON agent_personas;
CREATE POLICY "Users can update agents for their account"
  ON agent_personas FOR UPDATE
  USING (
    account_id = (
      SELECT account_id FROM user_accounts WHERE user_id = auth.uid() LIMIT 1
    )
  );

DROP POLICY IF EXISTS "Users can delete agents for their accounts" ON agent_personas;
CREATE POLICY "Users can delete agents for their account"
  ON agent_personas FOR DELETE
  USING (
    account_id = (
      SELECT account_id FROM user_accounts WHERE user_id = auth.uid() LIMIT 1
    )
  );

-- For tasks: simplify RLS
DROP POLICY IF EXISTS "Users can view tasks for their accounts" ON tasks;
CREATE POLICY "Users can view tasks for their account"
  ON tasks FOR SELECT
  USING (
    account_id = (
      SELECT account_id FROM user_accounts WHERE user_id = auth.uid() LIMIT 1
    )
  );

DROP POLICY IF EXISTS "Users can insert tasks for their accounts" ON tasks;
CREATE POLICY "Users can insert tasks for their account"
  ON tasks FOR INSERT
  WITH CHECK (
    account_id = (
      SELECT account_id FROM user_accounts WHERE user_id = auth.uid() LIMIT 1
    )
  );

DROP POLICY IF EXISTS "Users can update tasks for their accounts" ON tasks;
CREATE POLICY "Users can update tasks for their account"
  ON tasks FOR UPDATE
  USING (
    account_id = (
      SELECT account_id FROM user_accounts WHERE user_id = auth.uid() LIMIT 1
    )
  );

DROP POLICY IF EXISTS "Users can delete tasks for their accounts" ON tasks;
CREATE POLICY "Users can delete tasks for their account"
  ON tasks FOR DELETE
  USING (
    account_id = (
      SELECT account_id FROM user_accounts WHERE user_id = auth.uid() LIMIT 1
    )
  );

-- For projects: simplify RLS
DROP POLICY IF EXISTS "Users can view projects for their accounts" ON projects;
CREATE POLICY "Users can view projects for their account"
  ON projects FOR SELECT
  USING (
    account_id = (
      SELECT account_id FROM user_accounts WHERE user_id = auth.uid() LIMIT 1
    )
  );

DROP POLICY IF EXISTS "Users can insert projects for their accounts" ON projects;
CREATE POLICY "Users can insert projects for their account"
  ON projects FOR INSERT
  WITH CHECK (
    account_id = (
      SELECT account_id FROM user_accounts WHERE user_id = auth.uid() LIMIT 1
    )
  );

DROP POLICY IF EXISTS "Users can update projects for their accounts" ON projects;
CREATE POLICY "Users can update projects for their account"
  ON projects FOR UPDATE
  USING (
    account_id = (
      SELECT account_id FROM user_accounts WHERE user_id = auth.uid() LIMIT 1
    )
  );

DROP POLICY IF EXISTS "Users can delete projects for their accounts" ON projects;
CREATE POLICY "Users can delete projects for their account"
  ON projects FOR DELETE
  USING (
    account_id = (
      SELECT account_id FROM user_accounts WHERE user_id = auth.uid() LIMIT 1
    )
  );

-- For skills: simplify RLS
DROP POLICY IF EXISTS "Users can view skills for their accounts" ON skills;
CREATE POLICY "Users can view skills for their account"
  ON skills FOR SELECT
  USING (
    account_id = (
      SELECT account_id FROM user_accounts WHERE user_id = auth.uid() LIMIT 1
    )
  );

DROP POLICY IF EXISTS "Users can insert skills for their accounts" ON skills;
CREATE POLICY "Users can insert skills for their account"
  ON skills FOR INSERT
  WITH CHECK (
    account_id = (
      SELECT account_id FROM user_accounts WHERE user_id = auth.uid() LIMIT 1
    )
  );

DROP POLICY IF EXISTS "Users can update skills for their accounts" ON skills;
CREATE POLICY "Users can update skills for their account"
  ON skills FOR UPDATE
  USING (
    account_id = (
      SELECT account_id FROM user_accounts WHERE user_id = auth.uid() LIMIT 1
    )
  );

DROP POLICY IF EXISTS "Users can delete skills for their accounts" ON skills;
CREATE POLICY "Users can delete skills for their account"
  ON skills FOR DELETE
  USING (
    account_id = (
      SELECT account_id FROM user_accounts WHERE user_id = auth.uid() LIMIT 1
    )
  );

-- Comment explaining the change
COMMENT ON CONSTRAINT user_accounts_user_id_unique ON user_accounts IS
  'Each user can only belong to ONE account. Use different email for different accounts.';
