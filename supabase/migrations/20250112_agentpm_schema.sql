-- AgentPM Schema Migration
-- Based on Funnelists Enterprise Base Data Model v1.0
-- Date: 2025-01-12

-- =============================================================================
-- ACCOUNTS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS accounts (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL, -- Self-reference for BaseEntity compatibility

  -- Account specific
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled')),

  -- Settings
  settings JSONB DEFAULT '{
    "defaultLocale": "en-US",
    "defaultTimezone": "America/New_York",
    "defaultCurrency": "USD"
  }',

  -- Billing (reserved)
  currency TEXT DEFAULT 'USD',
  billing_email TEXT,
  stripe_customer_id TEXT,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'professional', 'enterprise')),
  plan_expires_at TIMESTAMPTZ,

  -- White Label (reserved)
  branding JSONB DEFAULT '{}',

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

  -- Operations
  idempotency_key TEXT,

  -- Permissions
  visibility TEXT DEFAULT 'private' CHECK (visibility IN ('private', 'team', 'account', 'public')),
  owner_id UUID,

  -- Compliance
  pii_fields TEXT[],
  retention_policy TEXT,

  -- ASI Trust
  trust_score DECIMAL(3,2),
  verified_by UUID[],
  signature_hash TEXT
);

-- Set account_id to self on insert
CREATE OR REPLACE FUNCTION set_account_self_reference()
RETURNS TRIGGER AS $$
BEGIN
  NEW.account_id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER accounts_set_self_reference
  BEFORE INSERT ON accounts
  FOR EACH ROW EXECUTE FUNCTION set_account_self_reference();

CREATE INDEX idx_accounts_slug ON accounts(slug);
CREATE INDEX idx_accounts_status ON accounts(status);
CREATE INDEX idx_accounts_deleted_at ON accounts(deleted_at);

-- =============================================================================
-- PROJECTS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS projects (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),

  -- Project specific
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'on_hold', 'completed', 'cancelled')),

  -- Dates
  start_date DATE,
  target_date DATE,
  completed_date DATE,

  -- Settings
  default_agent_id UUID, -- References agent_personas(id), added after table creation

  -- Stats (computed, updated by trigger)
  stats JSONB DEFAULT '{
    "totalTasks": 0,
    "completedTasks": 0,
    "progress": 0
  }',

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

  -- Operations
  idempotency_key TEXT,

  -- Permissions
  visibility TEXT DEFAULT 'private' CHECK (visibility IN ('private', 'team', 'account', 'public')),
  owner_id UUID,

  -- Compliance
  pii_fields TEXT[],
  retention_policy TEXT,

  -- ASI Trust
  trust_score DECIMAL(3,2),
  verified_by UUID[],
  signature_hash TEXT
);

CREATE INDEX idx_projects_account_id ON projects(account_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_deleted_at ON projects(deleted_at);

-- =============================================================================
-- AGENT PERSONAS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_personas (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),

  -- Agent Type
  agent_type TEXT NOT NULL, -- 'content-writer', 'image-generator', 'researcher', etc.

  -- Persona (Human-Friendly Identity)
  alias TEXT NOT NULL,
  tagline TEXT,
  avatar TEXT,
  description TEXT,

  -- Hierarchy
  reports_to JSONB, -- { id: string, type: 'agent' | 'user', name?: string }

  -- Capabilities & Restrictions
  capabilities TEXT[] NOT NULL DEFAULT '{}',
  restrictions TEXT[] DEFAULT '{}',
  triggers TEXT[] DEFAULT '{}',

  -- Autonomy Settings (ASI Safety)
  autonomy_level TEXT NOT NULL DEFAULT 'supervised' CHECK (autonomy_level IN ('supervised', 'semi-autonomous', 'autonomous')),
  requires_approval TEXT[] DEFAULT '{}',
  max_actions_per_hour INTEGER DEFAULT 50,
  max_cost_per_action INTEGER DEFAULT 100, -- cents
  can_spawn_agents BOOLEAN DEFAULT FALSE,
  can_modify_self BOOLEAN DEFAULT FALSE,

  -- Health & Status
  is_active BOOLEAN DEFAULT TRUE,
  paused_at TIMESTAMPTZ,
  paused_by UUID,
  pause_reason TEXT,
  consecutive_failures INTEGER DEFAULT 0,
  max_consecutive_failures INTEGER DEFAULT 5,
  last_health_check TIMESTAMPTZ,
  health_status TEXT DEFAULT 'healthy' CHECK (health_status IN ('healthy', 'degraded', 'failing', 'stopped')),

  -- Stats (computed)
  stats JSONB DEFAULT '{
    "tasksCompleted": 0,
    "tasksFailed": 0,
    "successRate": 100,
    "avgExecutionTime": 0,
    "totalCost": 0
  }',

  -- Display
  show_on_dashboard BOOLEAN DEFAULT TRUE,
  show_in_org_chart BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,

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

  -- Operations
  idempotency_key TEXT,

  -- Permissions
  visibility TEXT DEFAULT 'private' CHECK (visibility IN ('private', 'team', 'account', 'public')),
  owner_id UUID,

  -- Compliance
  pii_fields TEXT[],
  retention_policy TEXT,

  -- ASI Trust
  trust_score DECIMAL(3,2),
  verified_by UUID[],
  signature_hash TEXT
);

CREATE INDEX idx_agent_personas_account_id ON agent_personas(account_id);
CREATE INDEX idx_agent_personas_agent_type ON agent_personas(agent_type);
CREATE INDEX idx_agent_personas_is_active ON agent_personas(is_active);
CREATE INDEX idx_agent_personas_health_status ON agent_personas(health_status);
CREATE INDEX idx_agent_personas_deleted_at ON agent_personas(deleted_at);

-- Add FK to projects now that agent_personas exists
ALTER TABLE projects ADD CONSTRAINT fk_projects_default_agent
  FOREIGN KEY (default_agent_id) REFERENCES agent_personas(id);

-- =============================================================================
-- TASKS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS tasks (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),

  -- Task Definition
  title TEXT NOT NULL,
  description TEXT,

  -- Relationships
  project_id UUID REFERENCES projects(id),
  parent_task_id UUID REFERENCES tasks(id),
  related_entity_id UUID,
  related_entity_type TEXT,

  -- Assignment
  assigned_to UUID,
  assigned_to_type TEXT CHECK (assigned_to_type IN ('user', 'agent')),

  -- Scheduling
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  due_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'in_progress', 'review', 'completed', 'failed', 'cancelled')),
  status_history JSONB DEFAULT '[]',

  -- Context
  input JSONB DEFAULT '{}',
  output JSONB DEFAULT '{}',
  error JSONB,

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

  -- Operations
  idempotency_key TEXT,

  -- Permissions
  visibility TEXT DEFAULT 'private' CHECK (visibility IN ('private', 'team', 'account', 'public')),
  owner_id UUID,

  -- Compliance
  pii_fields TEXT[],
  retention_policy TEXT,

  -- ASI Trust
  trust_score DECIMAL(3,2),
  verified_by UUID[],
  signature_hash TEXT
);

CREATE INDEX idx_tasks_account_id ON tasks(account_id);
CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_due_at ON tasks(due_at);
CREATE INDEX idx_tasks_deleted_at ON tasks(deleted_at);

-- =============================================================================
-- AGENT ACTIONS TABLE (Reasoning Log)
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_actions (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),

  -- Relationships
  agent_id UUID NOT NULL REFERENCES agent_personas(id),
  task_id UUID REFERENCES tasks(id),
  goal_id UUID,

  -- Action
  action TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target TEXT,

  -- Result
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'cancelled')),
  result JSONB,
  error TEXT,

  -- Reasoning (ASI Explainability)
  reasoning TEXT,
  confidence DECIMAL(3,2),
  alternatives JSONB DEFAULT '[]',

  -- Human Override
  human_override BOOLEAN DEFAULT FALSE,
  human_override_by UUID,
  human_override_reason TEXT,

  -- Cost & Performance
  execution_time_ms INTEGER,
  cost INTEGER, -- cents
  tokens_used INTEGER,

  -- Audit: Created
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL,
  created_by_type TEXT NOT NULL DEFAULT 'agent' CHECK (created_by_type IN ('user', 'agent')),

  -- Audit: Updated
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID NOT NULL,
  updated_by_type TEXT NOT NULL DEFAULT 'agent' CHECK (updated_by_type IN ('user', 'agent')),

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

  -- Operations
  idempotency_key TEXT,

  -- Permissions
  visibility TEXT DEFAULT 'private' CHECK (visibility IN ('private', 'team', 'account', 'public')),
  owner_id UUID,

  -- ASI Trust
  trust_score DECIMAL(3,2),
  verified_by UUID[],
  signature_hash TEXT
);

CREATE INDEX idx_agent_actions_account_id ON agent_actions(account_id);
CREATE INDEX idx_agent_actions_agent_id ON agent_actions(agent_id);
CREATE INDEX idx_agent_actions_task_id ON agent_actions(task_id);
CREATE INDEX idx_agent_actions_status ON agent_actions(status);
CREATE INDEX idx_agent_actions_created_at ON agent_actions(created_at);

-- =============================================================================
-- AGENT GOALS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_goals (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),

  -- Relationship
  agent_id UUID NOT NULL REFERENCES agent_personas(id),

  -- Goal Definition
  objective TEXT NOT NULL,
  success_criteria TEXT[] NOT NULL DEFAULT '{}',
  constraints TEXT[] DEFAULT '{}',

  -- Progress
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'achieved', 'failed', 'abandoned')),
  progress INTEGER DEFAULT 0, -- 0-100

  -- ASI Alignment
  aligned_with UUID[],
  conflicts_with UUID[],
  human_approved BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMPTZ,

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

CREATE INDEX idx_agent_goals_account_id ON agent_goals(account_id);
CREATE INDEX idx_agent_goals_agent_id ON agent_goals(agent_id);
CREATE INDEX idx_agent_goals_status ON agent_goals(status);

-- =============================================================================
-- AGENT MESSAGES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_messages (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),

  -- Participants
  from_id UUID NOT NULL,
  from_type TEXT NOT NULL CHECK (from_type IN ('agent', 'user')),
  to_id UUID NOT NULL,
  to_type TEXT NOT NULL CHECK (to_type IN ('agent', 'user')),

  -- Message
  message_type TEXT NOT NULL CHECK (message_type IN ('request', 'response', 'broadcast', 'alert', 'status')),
  subject TEXT,
  content TEXT NOT NULL,

  -- Threading
  session_id UUID,
  in_reply_to UUID REFERENCES agent_messages(id),

  -- Protocol (A2A/MCP Ready)
  protocol TEXT CHECK (protocol IN ('a2a', 'mcp', 'internal')),

  -- Verification
  verified BOOLEAN DEFAULT FALSE,

  -- Status
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  read_at TIMESTAMPTZ,

  -- Audit: Created
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL,
  created_by_type TEXT NOT NULL DEFAULT 'agent' CHECK (created_by_type IN ('user', 'agent')),

  -- Audit: Updated
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID NOT NULL,
  updated_by_type TEXT NOT NULL DEFAULT 'agent' CHECK (updated_by_type IN ('user', 'agent')),

  -- Soft Delete
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  deleted_by_type TEXT CHECK (deleted_by_type IN ('user', 'agent')),

  -- ASI Trust
  trust_score DECIMAL(3,2),
  signature_hash TEXT
);

CREATE INDEX idx_agent_messages_account_id ON agent_messages(account_id);
CREATE INDEX idx_agent_messages_from_id ON agent_messages(from_id);
CREATE INDEX idx_agent_messages_to_id ON agent_messages(to_id);
CREATE INDEX idx_agent_messages_session_id ON agent_messages(session_id);
CREATE INDEX idx_agent_messages_status ON agent_messages(status);

-- =============================================================================
-- REVIEWS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS reviews (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),

  -- What's being reviewed
  task_id UUID NOT NULL REFERENCES tasks(id),
  agent_id UUID NOT NULL REFERENCES agent_personas(id),

  -- Review details
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'changes_requested')),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  feedback TEXT,

  -- For changes requested
  requested_changes TEXT[],

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
  tags TEXT[] DEFAULT '{}'
);

CREATE INDEX idx_reviews_account_id ON reviews(account_id);
CREATE INDEX idx_reviews_task_id ON reviews(task_id);
CREATE INDEX idx_reviews_agent_id ON reviews(agent_id);
CREATE INDEX idx_reviews_status ON reviews(status);

-- =============================================================================
-- AGENT NOTES TABLE (Voice/Text Captures)
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_notes (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),

  -- Raw capture
  content TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('voice', 'text', 'import')),

  -- Voice specific
  audio_url TEXT,
  transcription TEXT,

  -- Processing
  processed_at TIMESTAMPTZ,
  extracted_tasks UUID[] DEFAULT '{}',
  extracted_projects UUID[] DEFAULT '{}',

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
  tags TEXT[] DEFAULT '{}'
);

CREATE INDEX idx_agent_notes_account_id ON agent_notes(account_id);
CREATE INDEX idx_agent_notes_content_type ON agent_notes(content_type);
CREATE INDEX idx_agent_notes_processed_at ON agent_notes(processed_at);

-- =============================================================================
-- TRIGGERS: Auto-update updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_accounts_updated_at
  BEFORE UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_agent_personas_updated_at
  BEFORE UPDATE ON agent_personas FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_agent_actions_updated_at
  BEFORE UPDATE ON agent_actions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_agent_goals_updated_at
  BEFORE UPDATE ON agent_goals FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_agent_messages_updated_at
  BEFORE UPDATE ON agent_messages FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_reviews_updated_at
  BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_agent_notes_updated_at
  BEFORE UPDATE ON agent_notes FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- TRIGGERS: Update project stats when tasks change
-- =============================================================================

CREATE OR REPLACE FUNCTION update_project_stats()
RETURNS TRIGGER AS $$
DECLARE
  target_project_id UUID;
BEGIN
  target_project_id := COALESCE(NEW.project_id, OLD.project_id);

  IF target_project_id IS NOT NULL THEN
    UPDATE projects
    SET stats = (
      SELECT jsonb_build_object(
        'totalTasks', COUNT(*),
        'completedTasks', COUNT(*) FILTER (WHERE status = 'completed'),
        'progress', CASE
          WHEN COUNT(*) = 0 THEN 0
          ELSE ROUND((COUNT(*) FILTER (WHERE status = 'completed')::numeric / COUNT(*)::numeric) * 100)
        END
      )
      FROM tasks
      WHERE project_id = target_project_id
        AND deleted_at IS NULL
    )
    WHERE id = target_project_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_project_stats_on_task_change
  AFTER INSERT OR UPDATE OR DELETE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_project_stats();

-- =============================================================================
-- TRIGGERS: Update agent stats when actions complete
-- =============================================================================

CREATE OR REPLACE FUNCTION update_agent_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE agent_personas
  SET stats = (
    SELECT jsonb_build_object(
      'tasksCompleted', COUNT(*) FILTER (WHERE status = 'success'),
      'tasksFailed', COUNT(*) FILTER (WHERE status = 'failed'),
      'successRate', CASE
        WHEN COUNT(*) = 0 THEN 100
        ELSE ROUND((COUNT(*) FILTER (WHERE status = 'success')::numeric / COUNT(*)::numeric) * 100)
      END,
      'avgExecutionTime', COALESCE(ROUND(AVG(execution_time_ms)), 0),
      'lastRunAt', MAX(created_at),
      'totalCost', COALESCE(SUM(cost), 0)
    )
    FROM agent_actions
    WHERE agent_id = NEW.agent_id
      AND deleted_at IS NULL
  )
  WHERE id = NEW.agent_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_agent_stats_on_action
  AFTER INSERT OR UPDATE ON agent_actions
  FOR EACH ROW EXECUTE FUNCTION update_agent_stats();

-- =============================================================================
-- USER ACCOUNTS TABLE (Links auth.users to accounts)
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),

  -- Status
  is_primary BOOLEAN DEFAULT FALSE, -- User's primary account

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  UNIQUE(user_id, account_id)
);

CREATE INDEX idx_user_accounts_user_id ON user_accounts(user_id);
CREATE INDEX idx_user_accounts_account_id ON user_accounts(account_id);

-- Trigger to update updated_at
CREATE TRIGGER update_user_accounts_updated_at
  BEFORE UPDATE ON user_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE user_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_notes ENABLE ROW LEVEL SECURITY;

-- Helper function to get user's account_id from auth.users metadata
-- Note: This assumes account_id is stored in user metadata or a separate user_accounts table
-- Adjust based on your auth setup
CREATE OR REPLACE FUNCTION get_user_account_id()
RETURNS UUID AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'account_id')::UUID,
    (SELECT account_id FROM user_accounts WHERE user_id = auth.uid() LIMIT 1)
  );
$$ LANGUAGE SQL SECURITY DEFINER;

-- User Accounts: Users can see their own account memberships
CREATE POLICY "Users can view their account memberships"
  ON user_accounts FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their account memberships"
  ON user_accounts FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Accounts: Users can only see their own account
CREATE POLICY "Users can view their account"
  ON accounts FOR SELECT
  USING (id = get_user_account_id() AND deleted_at IS NULL);

CREATE POLICY "Users can update their account"
  ON accounts FOR UPDATE
  USING (id = get_user_account_id() AND deleted_at IS NULL);

-- Projects: Multi-tenant isolation
CREATE POLICY "Users can view projects in their account"
  ON projects FOR SELECT
  USING (account_id = get_user_account_id() AND deleted_at IS NULL);

CREATE POLICY "Users can insert projects in their account"
  ON projects FOR INSERT
  WITH CHECK (account_id = get_user_account_id());

CREATE POLICY "Users can update projects in their account"
  ON projects FOR UPDATE
  USING (account_id = get_user_account_id() AND deleted_at IS NULL);

-- Agent Personas: Multi-tenant isolation
CREATE POLICY "Users can view agents in their account"
  ON agent_personas FOR SELECT
  USING (account_id = get_user_account_id() AND deleted_at IS NULL);

CREATE POLICY "Users can insert agents in their account"
  ON agent_personas FOR INSERT
  WITH CHECK (account_id = get_user_account_id());

CREATE POLICY "Users can update agents in their account"
  ON agent_personas FOR UPDATE
  USING (account_id = get_user_account_id() AND deleted_at IS NULL);

-- Tasks: Multi-tenant isolation
CREATE POLICY "Users can view tasks in their account"
  ON tasks FOR SELECT
  USING (account_id = get_user_account_id() AND deleted_at IS NULL);

CREATE POLICY "Users can insert tasks in their account"
  ON tasks FOR INSERT
  WITH CHECK (account_id = get_user_account_id());

CREATE POLICY "Users can update tasks in their account"
  ON tasks FOR UPDATE
  USING (account_id = get_user_account_id() AND deleted_at IS NULL);

-- Agent Actions: Multi-tenant isolation
CREATE POLICY "Users can view actions in their account"
  ON agent_actions FOR SELECT
  USING (account_id = get_user_account_id() AND deleted_at IS NULL);

CREATE POLICY "Users can insert actions in their account"
  ON agent_actions FOR INSERT
  WITH CHECK (account_id = get_user_account_id());

-- Agent Goals: Multi-tenant isolation
CREATE POLICY "Users can view goals in their account"
  ON agent_goals FOR SELECT
  USING (account_id = get_user_account_id() AND deleted_at IS NULL);

CREATE POLICY "Users can insert goals in their account"
  ON agent_goals FOR INSERT
  WITH CHECK (account_id = get_user_account_id());

CREATE POLICY "Users can update goals in their account"
  ON agent_goals FOR UPDATE
  USING (account_id = get_user_account_id() AND deleted_at IS NULL);

-- Agent Messages: Multi-tenant isolation
CREATE POLICY "Users can view messages in their account"
  ON agent_messages FOR SELECT
  USING (account_id = get_user_account_id() AND deleted_at IS NULL);

CREATE POLICY "Users can insert messages in their account"
  ON agent_messages FOR INSERT
  WITH CHECK (account_id = get_user_account_id());

-- Reviews: Multi-tenant isolation
CREATE POLICY "Users can view reviews in their account"
  ON reviews FOR SELECT
  USING (account_id = get_user_account_id() AND deleted_at IS NULL);

CREATE POLICY "Users can insert reviews in their account"
  ON reviews FOR INSERT
  WITH CHECK (account_id = get_user_account_id());

CREATE POLICY "Users can update reviews in their account"
  ON reviews FOR UPDATE
  USING (account_id = get_user_account_id() AND deleted_at IS NULL);

-- Agent Notes: Multi-tenant isolation
CREATE POLICY "Users can view notes in their account"
  ON agent_notes FOR SELECT
  USING (account_id = get_user_account_id() AND deleted_at IS NULL);

CREATE POLICY "Users can insert notes in their account"
  ON agent_notes FOR INSERT
  WITH CHECK (account_id = get_user_account_id());

CREATE POLICY "Users can update notes in their account"
  ON agent_notes FOR UPDATE
  USING (account_id = get_user_account_id() AND deleted_at IS NULL);

-- =============================================================================
-- SERVICE ROLE POLICIES (for Edge Functions)
-- =============================================================================

-- Allow service role to bypass RLS for agent execution
CREATE POLICY "Service role full access to tasks"
  ON tasks FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to agent_personas"
  ON agent_personas FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to agent_actions"
  ON agent_actions FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to reviews"
  ON reviews FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
