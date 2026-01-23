-- Fix RLS policies to support multi-account access
-- The get_user_account_id() function only returns ONE account, but users can be in multiple accounts
-- This migration updates policies to check account membership instead

-- Create a helper function to check if the user is a member of a specific account
CREATE OR REPLACE FUNCTION user_is_account_member(check_account_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_accounts
    WHERE user_id = auth.uid()
    AND account_id = check_account_id
  );
$$ LANGUAGE SQL SECURITY DEFINER;

-- ============================================================================
-- TASKS TABLE - Update RLS policies
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view tasks in their account" ON tasks;
DROP POLICY IF EXISTS "Users can insert tasks in their account" ON tasks;
DROP POLICY IF EXISTS "Users can update tasks in their account" ON tasks;

-- Create new policies that check account membership
CREATE POLICY "Users can view tasks in their account"
  ON tasks FOR SELECT
  USING (user_is_account_member(account_id) AND deleted_at IS NULL);

CREATE POLICY "Users can insert tasks in their account"
  ON tasks FOR INSERT
  WITH CHECK (user_is_account_member(account_id));

CREATE POLICY "Users can update tasks in their account"
  ON tasks FOR UPDATE
  USING (user_is_account_member(account_id) AND deleted_at IS NULL)
  WITH CHECK (user_is_account_member(account_id));

-- ============================================================================
-- ACCOUNTS TABLE - Update RLS policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their account" ON accounts;
DROP POLICY IF EXISTS "Users can view their accounts" ON accounts;

CREATE POLICY "Users can view their accounts"
  ON accounts FOR SELECT
  USING (user_is_account_member(id) AND deleted_at IS NULL);

-- ============================================================================
-- PROJECTS TABLE - Update RLS policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can view projects in their account" ON projects;
DROP POLICY IF EXISTS "Users can insert projects in their account" ON projects;
DROP POLICY IF EXISTS "Users can update projects in their account" ON projects;

CREATE POLICY "Users can view projects in their account"
  ON projects FOR SELECT
  USING (user_is_account_member(account_id) AND deleted_at IS NULL);

CREATE POLICY "Users can insert projects in their account"
  ON projects FOR INSERT
  WITH CHECK (user_is_account_member(account_id));

CREATE POLICY "Users can update projects in their account"
  ON projects FOR UPDATE
  USING (user_is_account_member(account_id) AND deleted_at IS NULL)
  WITH CHECK (user_is_account_member(account_id));

-- ============================================================================
-- MILESTONES TABLE - Update RLS policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can view milestones in their account" ON milestones;
DROP POLICY IF EXISTS "Users can insert milestones in their account" ON milestones;
DROP POLICY IF EXISTS "Users can update milestones in their account" ON milestones;

CREATE POLICY "Users can view milestones in their account"
  ON milestones FOR SELECT
  USING (user_is_account_member(account_id) AND deleted_at IS NULL);

CREATE POLICY "Users can insert milestones in their account"
  ON milestones FOR INSERT
  WITH CHECK (user_is_account_member(account_id));

CREATE POLICY "Users can update milestones in their account"
  ON milestones FOR UPDATE
  USING (user_is_account_member(account_id) AND deleted_at IS NULL)
  WITH CHECK (user_is_account_member(account_id));

-- ============================================================================
-- AGENT_PERSONAS TABLE - Update RLS policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can view agents in their account" ON agent_personas;
DROP POLICY IF EXISTS "Users can insert agents in their account" ON agent_personas;
DROP POLICY IF EXISTS "Users can update agents in their account" ON agent_personas;

CREATE POLICY "Users can view agents in their account"
  ON agent_personas FOR SELECT
  USING (user_is_account_member(account_id) AND deleted_at IS NULL);

CREATE POLICY "Users can insert agents in their account"
  ON agent_personas FOR INSERT
  WITH CHECK (user_is_account_member(account_id));

CREATE POLICY "Users can update agents in their account"
  ON agent_personas FOR UPDATE
  USING (user_is_account_member(account_id) AND deleted_at IS NULL)
  WITH CHECK (user_is_account_member(account_id));

-- ============================================================================
-- KNOWLEDGE_ENTRIES TABLE - Update RLS policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can view knowledge in their account" ON knowledge_entries;
DROP POLICY IF EXISTS "Users can insert knowledge in their account" ON knowledge_entries;
DROP POLICY IF EXISTS "Users can update knowledge in their account" ON knowledge_entries;

CREATE POLICY "Users can view knowledge in their account"
  ON knowledge_entries FOR SELECT
  USING (user_is_account_member(account_id) AND deleted_at IS NULL);

CREATE POLICY "Users can insert knowledge in their account"
  ON knowledge_entries FOR INSERT
  WITH CHECK (user_is_account_member(account_id));

CREATE POLICY "Users can update knowledge in their account"
  ON knowledge_entries FOR UPDATE
  USING (user_is_account_member(account_id) AND deleted_at IS NULL)
  WITH CHECK (user_is_account_member(account_id));

-- ============================================================================
-- SKILLS TABLE - Update RLS policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can view skills in their account" ON skills;
DROP POLICY IF EXISTS "Users can insert skills in their account" ON skills;
DROP POLICY IF EXISTS "Users can update skills in their account" ON skills;

CREATE POLICY "Users can view skills in their account"
  ON skills FOR SELECT
  USING (user_is_account_member(account_id) AND deleted_at IS NULL);

CREATE POLICY "Users can insert skills in their account"
  ON skills FOR INSERT
  WITH CHECK (user_is_account_member(account_id));

CREATE POLICY "Users can update skills in their account"
  ON skills FOR UPDATE
  USING (user_is_account_member(account_id) AND deleted_at IS NULL)
  WITH CHECK (user_is_account_member(account_id));

-- ============================================================================
-- TASK_EXECUTIONS TABLE - Update RLS policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can view executions in their account" ON task_executions;
DROP POLICY IF EXISTS "Users can insert executions in their account" ON task_executions;
DROP POLICY IF EXISTS "Users can update executions in their account" ON task_executions;

CREATE POLICY "Users can view executions in their account"
  ON task_executions FOR SELECT
  USING (user_is_account_member(account_id));

CREATE POLICY "Users can insert executions in their account"
  ON task_executions FOR INSERT
  WITH CHECK (user_is_account_member(account_id));

CREATE POLICY "Users can update executions in their account"
  ON task_executions FOR UPDATE
  USING (user_is_account_member(account_id));

-- ============================================================================
-- CONTACTS TABLE - Update RLS policies (if exists)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'contacts') THEN
    DROP POLICY IF EXISTS "Users can view contacts in their account" ON contacts;
    DROP POLICY IF EXISTS "Users can insert contacts in their account" ON contacts;
    DROP POLICY IF EXISTS "Users can update contacts in their account" ON contacts;

    CREATE POLICY "Users can view contacts in their account"
      ON contacts FOR SELECT
      USING (user_is_account_member(account_id) AND deleted_at IS NULL);

    CREATE POLICY "Users can insert contacts in their account"
      ON contacts FOR INSERT
      WITH CHECK (user_is_account_member(account_id));

    CREATE POLICY "Users can update contacts in their account"
      ON contacts FOR UPDATE
      USING (user_is_account_member(account_id) AND deleted_at IS NULL)
      WITH CHECK (user_is_account_member(account_id));
  END IF;
END $$;

-- ============================================================================
-- PROJECT_CONTACTS TABLE - Update RLS policies (if exists)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'project_contacts') THEN
    DROP POLICY IF EXISTS "Users can view project_contacts in their account" ON project_contacts;
    DROP POLICY IF EXISTS "Users can insert project_contacts in their account" ON project_contacts;
    DROP POLICY IF EXISTS "Users can update project_contacts in their account" ON project_contacts;

    CREATE POLICY "Users can view project_contacts in their account"
      ON project_contacts FOR SELECT
      USING (user_is_account_member(account_id) AND deleted_at IS NULL);

    CREATE POLICY "Users can insert project_contacts in their account"
      ON project_contacts FOR INSERT
      WITH CHECK (user_is_account_member(account_id));

    CREATE POLICY "Users can update project_contacts in their account"
      ON project_contacts FOR UPDATE
      USING (user_is_account_member(account_id) AND deleted_at IS NULL)
      WITH CHECK (user_is_account_member(account_id));
  END IF;
END $$;

-- ============================================================================
-- PROJECT_SPACES TABLE - Update RLS policies (if exists)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'project_spaces') THEN
    DROP POLICY IF EXISTS "Users can view project_spaces in their account" ON project_spaces;
    DROP POLICY IF EXISTS "Users can insert project_spaces in their account" ON project_spaces;
    DROP POLICY IF EXISTS "Users can update project_spaces in their account" ON project_spaces;

    CREATE POLICY "Users can view project_spaces in their account"
      ON project_spaces FOR SELECT
      USING (user_is_account_member(account_id) AND deleted_at IS NULL);

    CREATE POLICY "Users can insert project_spaces in their account"
      ON project_spaces FOR INSERT
      WITH CHECK (user_is_account_member(account_id));

    CREATE POLICY "Users can update project_spaces in their account"
      ON project_spaces FOR UPDATE
      USING (user_is_account_member(account_id) AND deleted_at IS NULL)
      WITH CHECK (user_is_account_member(account_id));
  END IF;
END $$;
