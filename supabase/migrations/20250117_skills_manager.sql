-- Skills Manager Schema Migration
-- AgentPM Skills Manager for importing, organizing, and managing Claude Code skills
-- Date: 2025-01-17

-- =============================================================================
-- SKILLS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),

  -- Metadata
  name VARCHAR(255) NOT NULL,
  description TEXT,
  version VARCHAR(50) DEFAULT '1.0.0',
  author VARCHAR(255),
  tags TEXT[] DEFAULT '{}',

  -- Content
  content TEXT NOT NULL,

  -- Source tracking
  source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('github', 'local', 'marketplace')),
  source_url TEXT,
  source_repo VARCHAR(255),
  source_path VARCHAR(500),
  source_branch VARCHAR(100) DEFAULT 'main',
  source_sha VARCHAR(64), -- Git commit SHA for version tracking

  -- Status
  is_enabled BOOLEAN DEFAULT true,
  is_org_shared BOOLEAN DEFAULT false, -- Shared with entire org

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,

  -- Soft delete
  deleted_at TIMESTAMPTZ
);

-- Indexes
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

CREATE TABLE IF NOT EXISTS project_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique constraint
  UNIQUE(project_id, skill_id)
);

-- Indexes
CREATE INDEX idx_project_skills_project_id ON project_skills(project_id);
CREATE INDEX idx_project_skills_skill_id ON project_skills(skill_id);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Auto-update updated_at for skills
CREATE TRIGGER update_skills_updated_at
  BEFORE UPDATE ON skills FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-update updated_at for project_skills
CREATE TRIGGER update_project_skills_updated_at
  BEFORE UPDATE ON project_skills FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_skills ENABLE ROW LEVEL SECURITY;

-- Skills: Users can view their own skills and org-shared skills in their account
CREATE POLICY "Users can view own and org-shared skills"
  ON skills FOR SELECT
  USING (
    deleted_at IS NULL AND (
      user_id = auth.uid() OR
      (is_org_shared = true AND account_id = get_user_account_id()) OR
      account_id = get_user_account_id()
    )
  );

CREATE POLICY "Users can insert skills in their account"
  ON skills FOR INSERT
  WITH CHECK (
    account_id = get_user_account_id() AND
    user_id = auth.uid()
  );

CREATE POLICY "Users can update own skills"
  ON skills FOR UPDATE
  USING (
    user_id = auth.uid() AND
    deleted_at IS NULL
  );

CREATE POLICY "Users can delete own skills"
  ON skills FOR DELETE
  USING (user_id = auth.uid());

-- Project Skills: Users can manage skills for projects in their account
CREATE POLICY "Users can view project skills in their account"
  ON project_skills FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM projects
      WHERE account_id = get_user_account_id() AND deleted_at IS NULL
    )
  );

CREATE POLICY "Users can insert project skills in their account"
  ON project_skills FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM projects
      WHERE account_id = get_user_account_id() AND deleted_at IS NULL
    )
  );

CREATE POLICY "Users can update project skills in their account"
  ON project_skills FOR UPDATE
  USING (
    project_id IN (
      SELECT id FROM projects
      WHERE account_id = get_user_account_id() AND deleted_at IS NULL
    )
  );

CREATE POLICY "Users can delete project skills in their account"
  ON project_skills FOR DELETE
  USING (
    project_id IN (
      SELECT id FROM projects
      WHERE account_id = get_user_account_id() AND deleted_at IS NULL
    )
  );

-- =============================================================================
-- SERVICE ROLE POLICIES
-- =============================================================================

CREATE POLICY "Service role full access to skills"
  ON skills FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to project_skills"
  ON project_skills FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
