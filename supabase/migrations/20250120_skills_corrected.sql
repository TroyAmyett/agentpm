-- =============================================================================
-- SKILLS CORRECTED MIGRATION
-- Aligns with actual user_accounts junction table architecture
-- Date: 2025-01-20
-- =============================================================================

-- =============================================================================
-- DROP EXISTING TABLES AND POLICIES (clean slate)
-- =============================================================================

-- Drop project_skills first (foreign key dependency)
DROP TABLE IF EXISTS project_skills CASCADE;

-- Drop skills table
DROP TABLE IF EXISTS skills CASCADE;

-- =============================================================================
-- SKILLS TABLE
-- =============================================================================

CREATE TABLE skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),

  -- Metadata
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255),
  description TEXT,
  version VARCHAR(50) DEFAULT '1.0.0',
  author VARCHAR(255),
  tags TEXT[] DEFAULT '{}',

  -- Content
  content TEXT NOT NULL,
  icon VARCHAR(50),
  category VARCHAR(100),

  -- Source tracking
  source_type VARCHAR(50) DEFAULT 'manual',
  source_url TEXT,
  source_repo VARCHAR(255),
  source_path TEXT,
  source_branch VARCHAR(100) DEFAULT 'main',
  source_sha VARCHAR(100),

  -- Status
  is_enabled BOOLEAN DEFAULT true,
  is_org_shared BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Indexes for skills
CREATE INDEX idx_skills_account_id ON skills(account_id);
CREATE INDEX idx_skills_user_id ON skills(user_id);
CREATE INDEX idx_skills_source_type ON skills(source_type);
CREATE INDEX idx_skills_is_enabled ON skills(is_enabled);
CREATE INDEX idx_skills_is_org_shared ON skills(is_org_shared);
CREATE INDEX idx_skills_deleted_at ON skills(deleted_at);
CREATE INDEX idx_skills_tags ON skills USING GIN(tags);

-- =============================================================================
-- PROJECT_SKILLS TABLE (skill assignments per project)
-- =============================================================================

CREATE TABLE project_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique constraint
  UNIQUE(project_id, skill_id)
);

-- Indexes for project_skills
CREATE INDEX idx_project_skills_project_id ON project_skills(project_id);
CREATE INDEX idx_project_skills_skill_id ON project_skills(skill_id);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Auto-update updated_at for skills
DROP TRIGGER IF EXISTS update_skills_updated_at ON skills;
CREATE TRIGGER update_skills_updated_at
  BEFORE UPDATE ON skills FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-update updated_at for project_skills
DROP TRIGGER IF EXISTS update_project_skills_updated_at ON project_skills;
CREATE TRIGGER update_project_skills_updated_at
  BEFORE UPDATE ON project_skills FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- ROW LEVEL SECURITY - SKILLS
-- Using EXISTS pattern with user_accounts junction table
-- =============================================================================

ALTER TABLE skills ENABLE ROW LEVEL SECURITY;

-- Users can view skills for accounts they belong to (plus soft-delete filter)
CREATE POLICY "Users can view skills for their accounts"
  ON skills FOR SELECT
  USING (
    deleted_at IS NULL AND
    EXISTS (
      SELECT 1 FROM user_accounts
      WHERE user_accounts.account_id = skills.account_id
      AND user_accounts.user_id = auth.uid()
    )
  );

-- Users can insert skills for accounts they belong to
CREATE POLICY "Users can insert skills for their accounts"
  ON skills FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_accounts
      WHERE user_accounts.account_id = skills.account_id
      AND user_accounts.user_id = auth.uid()
    )
  );

-- Users can update skills for accounts they belong to
CREATE POLICY "Users can update skills for their accounts"
  ON skills FOR UPDATE
  USING (
    deleted_at IS NULL AND
    EXISTS (
      SELECT 1 FROM user_accounts
      WHERE user_accounts.account_id = skills.account_id
      AND user_accounts.user_id = auth.uid()
    )
  );

-- Users can delete skills for accounts they belong to
CREATE POLICY "Users can delete skills for their accounts"
  ON skills FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_accounts
      WHERE user_accounts.account_id = skills.account_id
      AND user_accounts.user_id = auth.uid()
    )
  );

-- Service role has full access to skills
CREATE POLICY "Service role full access to skills"
  ON skills FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- =============================================================================
-- ROW LEVEL SECURITY - PROJECT_SKILLS
-- Using EXISTS pattern with user_accounts junction table
-- =============================================================================

ALTER TABLE project_skills ENABLE ROW LEVEL SECURITY;

-- Users can view project skills for projects in accounts they belong to
CREATE POLICY "Users can view project skills for their accounts"
  ON project_skills FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN user_accounts ua ON ua.account_id = p.account_id
      WHERE p.id = project_skills.project_id
      AND ua.user_id = auth.uid()
      AND p.deleted_at IS NULL
    )
  );

-- Users can insert project skills for projects in accounts they belong to
CREATE POLICY "Users can insert project skills for their accounts"
  ON project_skills FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN user_accounts ua ON ua.account_id = p.account_id
      WHERE p.id = project_skills.project_id
      AND ua.user_id = auth.uid()
      AND p.deleted_at IS NULL
    )
  );

-- Users can update project skills for projects in accounts they belong to
CREATE POLICY "Users can update project skills for their accounts"
  ON project_skills FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN user_accounts ua ON ua.account_id = p.account_id
      WHERE p.id = project_skills.project_id
      AND ua.user_id = auth.uid()
      AND p.deleted_at IS NULL
    )
  );

-- Users can delete project skills for projects in accounts they belong to
CREATE POLICY "Users can delete project skills for their accounts"
  ON project_skills FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN user_accounts ua ON ua.account_id = p.account_id
      WHERE p.id = project_skills.project_id
      AND ua.user_id = auth.uid()
      AND p.deleted_at IS NULL
    )
  );

-- Service role has full access to project_skills
CREATE POLICY "Service role full access to project_skills"
  ON project_skills FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

