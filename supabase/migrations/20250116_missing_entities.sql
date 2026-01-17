-- AgentPM Missing Entities Migration
-- Adds: contacts, project_contacts, milestones, agent_api_keys
-- Date: 2025-01-16

-- =============================================================================
-- CONTACTS TABLE (Unified - Can Become User)
-- =============================================================================

CREATE TABLE IF NOT EXISTS contacts (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- Identity
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,

  -- Role at account
  title TEXT,
  department TEXT,

  -- User enablement
  is_user BOOLEAN DEFAULT FALSE,
  auth_provider TEXT CHECK (auth_provider IN ('google', 'email', 'microsoft', 'github')),
  last_login_at TIMESTAMPTZ,
  permissions TEXT[] DEFAULT '{}',

  -- Metadata
  notes TEXT,

  -- Audit: Created
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL,
  created_by_type TEXT NOT NULL DEFAULT 'user' CHECK (created_by_type IN ('user', 'agent')),

  -- Audit: Updated
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID NOT NULL,
  updated_by_type TEXT NOT NULL DEFAULT 'user' CHECK (updated_by_type IN ('user', 'agent')),

  -- Soft Delete
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  deleted_by_type TEXT CHECK (deleted_by_type IN ('user', 'agent')),

  -- External Systems
  external_ids JSONB DEFAULT '{}',

  -- Categorization
  tags TEXT[] DEFAULT '{}',

  -- i18n
  locale TEXT,
  timezone TEXT,

  -- Permissions
  visibility TEXT DEFAULT 'private' CHECK (visibility IN ('private', 'team', 'account', 'public')),
  owner_id UUID,

  -- ASI Trust
  trust_score DECIMAL(3,2),
  verified_by UUID[],
  signature_hash TEXT,

  -- Unique email per account
  CONSTRAINT unique_email_per_account UNIQUE (account_id, email)
);

CREATE INDEX IF NOT EXISTS idx_contacts_account_id ON contacts(account_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_is_user ON contacts(is_user);
CREATE INDEX IF NOT EXISTS idx_contacts_deleted_at ON contacts(deleted_at);

-- =============================================================================
-- PROJECT CONTACTS TABLE (Roles/Assignments)
-- =============================================================================

CREATE TABLE IF NOT EXISTS project_contacts (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- Relationships
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,

  -- Role
  role TEXT NOT NULL DEFAULT 'contributor' CHECK (role IN ('owner', 'stakeholder', 'reviewer', 'contributor')),

  -- Notifications
  notify_on_task_complete BOOLEAN DEFAULT FALSE,
  notify_on_milestone BOOLEAN DEFAULT FALSE,
  notify_on_review BOOLEAN DEFAULT FALSE,

  -- Audit
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  added_by UUID NOT NULL,
  added_by_type TEXT NOT NULL DEFAULT 'user' CHECK (added_by_type IN ('user', 'agent')),

  -- Soft Delete
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  deleted_by_type TEXT CHECK (deleted_by_type IN ('user', 'agent')),

  -- Unique constraint
  CONSTRAINT unique_project_contact UNIQUE (project_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_project_contacts_account_id ON project_contacts(account_id);
CREATE INDEX IF NOT EXISTS idx_project_contacts_project_id ON project_contacts(project_id);
CREATE INDEX IF NOT EXISTS idx_project_contacts_contact_id ON project_contacts(contact_id);
CREATE INDEX IF NOT EXISTS idx_project_contacts_role ON project_contacts(role);

-- =============================================================================
-- MILESTONES TABLE (Optional Grouping)
-- =============================================================================

CREATE TABLE IF NOT EXISTS milestones (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- Relationship
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Milestone details
  name TEXT NOT NULL,
  description TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),

  -- Ordering
  sort_order INTEGER DEFAULT 0,

  -- Dates
  due_date DATE,
  completed_at TIMESTAMPTZ,

  -- Audit: Created
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL,
  created_by_type TEXT NOT NULL DEFAULT 'user' CHECK (created_by_type IN ('user', 'agent')),

  -- Audit: Updated
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID NOT NULL,
  updated_by_type TEXT NOT NULL DEFAULT 'user' CHECK (updated_by_type IN ('user', 'agent')),

  -- Soft Delete
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  deleted_by_type TEXT CHECK (deleted_by_type IN ('user', 'agent')),

  -- Categorization
  tags TEXT[] DEFAULT '{}',

  -- ASI Trust
  trust_score DECIMAL(3,2),
  verified_by UUID[],
  signature_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_milestones_account_id ON milestones(account_id);
CREATE INDEX IF NOT EXISTS idx_milestones_project_id ON milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_milestones_status ON milestones(status);
CREATE INDEX IF NOT EXISTS idx_milestones_deleted_at ON milestones(deleted_at);

-- Add milestone_id FK to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_milestone_id ON tasks(milestone_id);

-- =============================================================================
-- AGENT API KEYS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_api_keys (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- Key details
  name TEXT NOT NULL,                      -- "content-writer-prod"
  key_hash TEXT NOT NULL,                  -- Hashed API key (never store raw)
  key_prefix TEXT NOT NULL,                -- First 8 chars for identification

  -- Restrictions
  agent_type TEXT,                         -- Limit to specific agent type
  agent_id UUID REFERENCES agent_personas(id) ON DELETE SET NULL,  -- Limit to specific agent

  -- Permissions
  scopes TEXT[] DEFAULT '{"queue:read", "queue:write", "task:update"}',

  -- Rate limiting
  rate_limit_per_minute INTEGER DEFAULT 60,
  rate_limit_per_hour INTEGER DEFAULT 1000,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMPTZ,

  -- Usage tracking
  last_used_at TIMESTAMPTZ,
  total_requests INTEGER DEFAULT 0,

  -- Audit: Created
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL,
  created_by_type TEXT NOT NULL DEFAULT 'user' CHECK (created_by_type IN ('user', 'agent')),

  -- Audit: Updated
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID NOT NULL,
  updated_by_type TEXT NOT NULL DEFAULT 'user' CHECK (updated_by_type IN ('user', 'agent')),

  -- Revocation
  revoked_at TIMESTAMPTZ,
  revoked_by UUID,
  revoked_reason TEXT,

  -- Categorization
  tags TEXT[] DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_agent_api_keys_account_id ON agent_api_keys(account_id);
CREATE INDEX IF NOT EXISTS idx_agent_api_keys_key_prefix ON agent_api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_agent_api_keys_agent_type ON agent_api_keys(agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_api_keys_is_active ON agent_api_keys(is_active);

-- =============================================================================
-- TRIGGERS: Auto-update updated_at for new tables
-- =============================================================================

CREATE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_milestones_updated_at
  BEFORE UPDATE ON milestones FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_agent_api_keys_updated_at
  BEFORE UPDATE ON agent_api_keys FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- TRIGGER: Update milestone status based on tasks
-- =============================================================================

CREATE OR REPLACE FUNCTION update_milestone_status()
RETURNS TRIGGER AS $$
DECLARE
  target_milestone_id UUID;
  total_tasks INTEGER;
  completed_tasks INTEGER;
BEGIN
  target_milestone_id := COALESCE(NEW.milestone_id, OLD.milestone_id);

  IF target_milestone_id IS NOT NULL THEN
    SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'completed')
    INTO total_tasks, completed_tasks
    FROM tasks
    WHERE milestone_id = target_milestone_id
      AND deleted_at IS NULL;

    UPDATE milestones
    SET status = CASE
      WHEN total_tasks = 0 THEN 'not_started'
      WHEN completed_tasks = total_tasks THEN 'completed'
      ELSE 'in_progress'
    END,
    completed_at = CASE
      WHEN completed_tasks = total_tasks AND total_tasks > 0 THEN NOW()
      ELSE NULL
    END
    WHERE id = target_milestone_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_milestone_status_on_task_change
  AFTER INSERT OR UPDATE OR DELETE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_milestone_status();

-- =============================================================================
-- ROW LEVEL SECURITY for new tables
-- =============================================================================

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_api_keys ENABLE ROW LEVEL SECURITY;

-- Contacts: Multi-tenant isolation
CREATE POLICY "Users can view contacts in their account"
  ON contacts FOR SELECT
  USING (account_id = get_user_account_id() AND deleted_at IS NULL);

CREATE POLICY "Users can insert contacts in their account"
  ON contacts FOR INSERT
  WITH CHECK (account_id = get_user_account_id());

CREATE POLICY "Users can update contacts in their account"
  ON contacts FOR UPDATE
  USING (account_id = get_user_account_id() AND deleted_at IS NULL);

-- Project Contacts: Multi-tenant isolation
CREATE POLICY "Users can view project_contacts in their account"
  ON project_contacts FOR SELECT
  USING (account_id = get_user_account_id() AND deleted_at IS NULL);

CREATE POLICY "Users can insert project_contacts in their account"
  ON project_contacts FOR INSERT
  WITH CHECK (account_id = get_user_account_id());

CREATE POLICY "Users can update project_contacts in their account"
  ON project_contacts FOR UPDATE
  USING (account_id = get_user_account_id() AND deleted_at IS NULL);

-- Milestones: Multi-tenant isolation
CREATE POLICY "Users can view milestones in their account"
  ON milestones FOR SELECT
  USING (account_id = get_user_account_id() AND deleted_at IS NULL);

CREATE POLICY "Users can insert milestones in their account"
  ON milestones FOR INSERT
  WITH CHECK (account_id = get_user_account_id());

CREATE POLICY "Users can update milestones in their account"
  ON milestones FOR UPDATE
  USING (account_id = get_user_account_id() AND deleted_at IS NULL);

-- Agent API Keys: Multi-tenant isolation
CREATE POLICY "Users can view api_keys in their account"
  ON agent_api_keys FOR SELECT
  USING (account_id = get_user_account_id());

CREATE POLICY "Users can insert api_keys in their account"
  ON agent_api_keys FOR INSERT
  WITH CHECK (account_id = get_user_account_id());

CREATE POLICY "Users can update api_keys in their account"
  ON agent_api_keys FOR UPDATE
  USING (account_id = get_user_account_id());

-- Service role full access for new tables
CREATE POLICY "Service role full access to contacts"
  ON contacts FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to project_contacts"
  ON project_contacts FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to milestones"
  ON milestones FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to agent_api_keys"
  ON agent_api_keys FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- =============================================================================
-- EXTEND ACCOUNTS TABLE (from PRD)
-- =============================================================================

-- Add account type and additional config fields
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'internal' CHECK (type IN ('internal', 'client', 'personal'));
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}';

-- The config JSONB can store:
-- {
--   "website": "https://example.com",
--   "cmsEndpoint": "https://example.com/api/posts",
--   "cmsApiKey": "encrypted_key",
--   "brandGuidelines": "Text or link to doc",
--   "defaultTone": "conversational",
--   "logoUrl": "https://...",
--   "primaryColor": "#0ea5e9",
--   "socialLinks": { "linkedin": "...", "twitter": "...", "youtube": "..." },
--   "specialInstructions": "Always mention Agentforce",
--   "salesforceOrg": "org_id",
--   "salesforceConnected": true
-- }

COMMENT ON COLUMN accounts.config IS 'Account-specific configuration for agents: website, cmsEndpoint, brandGuidelines, defaultTone, socialLinks, specialInstructions, etc.';
