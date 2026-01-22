-- Project Spaces Migration
-- Extends projects with repository config, knowledge, dependencies
-- Date: 2025-01-22

-- =============================================================================
-- EXTEND PROJECTS TABLE (Project Spaces)
-- =============================================================================

-- Add repository and space configuration to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS repository_url TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS repository_path TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS base_branch TEXT DEFAULT 'main';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS test_command TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS build_command TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS default_priority TEXT DEFAULT 'medium' CHECK (default_priority IN ('critical', 'high', 'medium', 'low'));

-- =============================================================================
-- PROJECT LINKED ITEMS (Many-to-Many: Projects <-> Folders/Notes)
-- =============================================================================

CREATE TABLE IF NOT EXISTS project_linked_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- What's being linked
  item_type TEXT NOT NULL CHECK (item_type IN ('folder', 'note')),
  item_id UUID NOT NULL,

  -- Metadata
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  added_by UUID NOT NULL,
  added_by_type TEXT NOT NULL DEFAULT 'user' CHECK (added_by_type IN ('user', 'agent')),

  -- Prevent duplicates
  UNIQUE(project_id, item_type, item_id)
);

CREATE INDEX idx_project_linked_items_project_id ON project_linked_items(project_id);
CREATE INDEX idx_project_linked_items_item ON project_linked_items(item_type, item_id);

-- RLS for project_linked_items
ALTER TABLE project_linked_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view linked items in their account"
  ON project_linked_items FOR SELECT
  USING (account_id = get_user_account_id());

CREATE POLICY "Users can insert linked items in their account"
  ON project_linked_items FOR INSERT
  WITH CHECK (account_id = get_user_account_id());

CREATE POLICY "Users can delete linked items in their account"
  ON project_linked_items FOR DELETE
  USING (account_id = get_user_account_id());

-- =============================================================================
-- MILESTONES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Milestone details
  name TEXT NOT NULL,
  description TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
  sort_order INTEGER NOT NULL DEFAULT 0,

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
  deleted_by_type TEXT CHECK (deleted_by_type IN ('user', 'agent'))
);

CREATE INDEX idx_milestones_project_id ON milestones(project_id);
CREATE INDEX idx_milestones_status ON milestones(status);
CREATE INDEX idx_milestones_due_date ON milestones(due_date);
CREATE INDEX idx_milestones_deleted_at ON milestones(deleted_at);

-- Add milestone_id to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS milestone_id UUID REFERENCES milestones(id);
CREATE INDEX IF NOT EXISTS idx_tasks_milestone_id ON tasks(milestone_id);

-- RLS for milestones
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view milestones in their account"
  ON milestones FOR SELECT
  USING (account_id = get_user_account_id() AND deleted_at IS NULL);

CREATE POLICY "Users can insert milestones in their account"
  ON milestones FOR INSERT
  WITH CHECK (account_id = get_user_account_id());

CREATE POLICY "Users can update milestones in their account"
  ON milestones FOR UPDATE
  USING (account_id = get_user_account_id() AND deleted_at IS NULL);

-- Trigger for updated_at
CREATE TRIGGER update_milestones_updated_at
  BEFORE UPDATE ON milestones FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- TASK DEPENDENCIES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),

  -- The task that has the dependency
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,

  -- The task it depends on
  depends_on_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,

  -- Dependency type
  -- FS = Finish-to-Start (most common: B can't start until A finishes)
  -- SS = Start-to-Start (B can't start until A starts)
  -- FF = Finish-to-Finish (B can't finish until A finishes)
  -- SF = Start-to-Finish (B can't finish until A starts, rare)
  dependency_type TEXT NOT NULL DEFAULT 'FS' CHECK (dependency_type IN ('FS', 'SS', 'FF', 'SF')),

  -- Lag time in days (positive = delay, negative = overlap)
  lag_days INTEGER DEFAULT 0,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL,
  created_by_type TEXT NOT NULL DEFAULT 'user' CHECK (created_by_type IN ('user', 'agent')),

  -- Prevent duplicate dependencies
  UNIQUE(task_id, depends_on_task_id),

  -- Prevent self-referential dependencies
  CHECK (task_id != depends_on_task_id)
);

CREATE INDEX idx_task_dependencies_task_id ON task_dependencies(task_id);
CREATE INDEX idx_task_dependencies_depends_on ON task_dependencies(depends_on_task_id);

-- RLS for task_dependencies
ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view dependencies in their account"
  ON task_dependencies FOR SELECT
  USING (account_id = get_user_account_id());

CREATE POLICY "Users can insert dependencies in their account"
  ON task_dependencies FOR INSERT
  WITH CHECK (account_id = get_user_account_id());

CREATE POLICY "Users can delete dependencies in their account"
  ON task_dependencies FOR DELETE
  USING (account_id = get_user_account_id());

-- =============================================================================
-- KNOWLEDGE ENTRIES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS knowledge_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Knowledge type
  knowledge_type TEXT NOT NULL CHECK (knowledge_type IN ('fact', 'decision', 'constraint', 'reference', 'glossary')),

  -- Content
  content TEXT NOT NULL,

  -- Source tracking
  source_note_id UUID,
  source_task_id UUID REFERENCES tasks(id),
  extracted_at TIMESTAMPTZ,
  extracted_by TEXT, -- AI model name or user ID

  -- Validation
  is_verified BOOLEAN DEFAULT FALSE,
  verified_by UUID,
  verified_at TIMESTAMPTZ,

  -- Relevance
  tags TEXT[] DEFAULT '{}',
  related_entity_ids UUID[] DEFAULT '{}',

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
  deleted_by_type TEXT CHECK (deleted_by_type IN ('user', 'agent'))
);

CREATE INDEX idx_knowledge_entries_project_id ON knowledge_entries(project_id);
CREATE INDEX idx_knowledge_entries_type ON knowledge_entries(knowledge_type);
CREATE INDEX idx_knowledge_entries_source_note ON knowledge_entries(source_note_id);
CREATE INDEX idx_knowledge_entries_tags ON knowledge_entries USING GIN(tags);
CREATE INDEX idx_knowledge_entries_deleted_at ON knowledge_entries(deleted_at);

-- Full-text search on content
CREATE INDEX idx_knowledge_entries_content_search ON knowledge_entries USING GIN(to_tsvector('english', content));

-- RLS for knowledge_entries
ALTER TABLE knowledge_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view knowledge in their account"
  ON knowledge_entries FOR SELECT
  USING (account_id = get_user_account_id() AND deleted_at IS NULL);

CREATE POLICY "Users can insert knowledge in their account"
  ON knowledge_entries FOR INSERT
  WITH CHECK (account_id = get_user_account_id());

CREATE POLICY "Users can update knowledge in their account"
  ON knowledge_entries FOR UPDATE
  USING (account_id = get_user_account_id() AND deleted_at IS NULL);

-- Trigger for updated_at
CREATE TRIGGER update_knowledge_entries_updated_at
  BEFORE UPDATE ON knowledge_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- EXTEND TASKS TABLE (Estimation & Scheduling)
-- =============================================================================

-- Time estimation
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_hours DECIMAL(6,2);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS story_points INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS actual_hours DECIMAL(6,2);

-- Scheduling (auto-calculated from dependencies)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS scheduled_start_date DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS scheduled_end_date DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS calculated_start_date DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS calculated_end_date DATE;

-- Source tracking (which note/section generated this task)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_note_id UUID;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_section TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_source_note_id ON tasks(source_note_id);

-- =============================================================================
-- TIME ENTRIES TABLE (for actual hours tracking)
-- =============================================================================

CREATE TABLE IF NOT EXISTS time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,

  -- Who logged time
  user_id UUID,
  agent_id UUID REFERENCES agent_personas(id),

  -- Time logged
  hours DECIMAL(6,2) NOT NULL,
  description TEXT,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL,
  created_by_type TEXT NOT NULL DEFAULT 'user' CHECK (created_by_type IN ('user', 'agent')),

  -- At least one of user_id or agent_id must be set
  CHECK (user_id IS NOT NULL OR agent_id IS NOT NULL)
);

CREATE INDEX idx_time_entries_task_id ON time_entries(task_id);
CREATE INDEX idx_time_entries_user_id ON time_entries(user_id);
CREATE INDEX idx_time_entries_agent_id ON time_entries(agent_id);
CREATE INDEX idx_time_entries_entry_date ON time_entries(entry_date);

-- RLS for time_entries
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view time entries in their account"
  ON time_entries FOR SELECT
  USING (account_id = get_user_account_id());

CREATE POLICY "Users can insert time entries in their account"
  ON time_entries FOR INSERT
  WITH CHECK (account_id = get_user_account_id());

CREATE POLICY "Users can delete their own time entries"
  ON time_entries FOR DELETE
  USING (account_id = get_user_account_id() AND user_id = auth.uid());

-- Trigger to update task.actual_hours when time entries change
CREATE OR REPLACE FUNCTION update_task_actual_hours()
RETURNS TRIGGER AS $$
DECLARE
  target_task_id UUID;
BEGIN
  target_task_id := COALESCE(NEW.task_id, OLD.task_id);

  UPDATE tasks
  SET actual_hours = (
    SELECT COALESCE(SUM(hours), 0)
    FROM time_entries
    WHERE task_id = target_task_id
  )
  WHERE id = target_task_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_task_actual_hours_on_entry
  AFTER INSERT OR UPDATE OR DELETE ON time_entries
  FOR EACH ROW EXECUTE FUNCTION update_task_actual_hours();

-- =============================================================================
-- CIRCULAR DEPENDENCY CHECK FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION check_circular_dependency()
RETURNS TRIGGER AS $$
DECLARE
  has_cycle BOOLEAN;
BEGIN
  -- Use recursive CTE to detect cycles
  WITH RECURSIVE dependency_chain AS (
    -- Start with the new dependency
    SELECT NEW.depends_on_task_id AS task_id, 1 AS depth

    UNION ALL

    -- Follow the chain of dependencies
    SELECT td.depends_on_task_id, dc.depth + 1
    FROM task_dependencies td
    INNER JOIN dependency_chain dc ON td.task_id = dc.task_id
    WHERE dc.depth < 100 -- Prevent infinite loops
  )
  SELECT EXISTS (
    SELECT 1 FROM dependency_chain WHERE task_id = NEW.task_id
  ) INTO has_cycle;

  IF has_cycle THEN
    RAISE EXCEPTION 'Circular dependency detected: Task % would create a cycle', NEW.task_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_circular_dependency_on_insert
  BEFORE INSERT ON task_dependencies
  FOR EACH ROW EXECUTE FUNCTION check_circular_dependency();

-- =============================================================================
-- VIEW: Tasks with dependency status
-- =============================================================================

CREATE OR REPLACE VIEW tasks_with_dependencies AS
SELECT
  t.*,
  -- Count of blockers
  (SELECT COUNT(*) FROM task_dependencies td WHERE td.task_id = t.id) AS blocker_count,
  -- Count of incomplete blockers
  (
    SELECT COUNT(*)
    FROM task_dependencies td
    INNER JOIN tasks blocker ON td.depends_on_task_id = blocker.id
    WHERE td.task_id = t.id
      AND blocker.status NOT IN ('completed', 'cancelled')
  ) AS incomplete_blocker_count,
  -- Is blocked?
  (
    SELECT EXISTS (
      SELECT 1
      FROM task_dependencies td
      INNER JOIN tasks blocker ON td.depends_on_task_id = blocker.id
      WHERE td.task_id = t.id
        AND blocker.status NOT IN ('completed', 'cancelled')
    )
  ) AS is_blocked,
  -- Array of blocker task IDs
  (
    SELECT COALESCE(array_agg(td.depends_on_task_id), '{}')
    FROM task_dependencies td
    WHERE td.task_id = t.id
  ) AS blocked_by,
  -- Array of tasks this blocks
  (
    SELECT COALESCE(array_agg(td.task_id), '{}')
    FROM task_dependencies td
    WHERE td.depends_on_task_id = t.id
  ) AS blocks
FROM tasks t
WHERE t.deleted_at IS NULL;

-- =============================================================================
-- FUNCTION: Get project knowledge context (for AI)
-- =============================================================================

CREATE OR REPLACE FUNCTION get_project_knowledge_context(p_project_id UUID)
RETURNS TEXT AS $$
DECLARE
  context TEXT := '';
  entry RECORD;
BEGIN
  FOR entry IN
    SELECT knowledge_type, content
    FROM knowledge_entries
    WHERE project_id = p_project_id
      AND deleted_at IS NULL
      AND is_verified = TRUE
    ORDER BY knowledge_type, created_at
  LOOP
    context := context || '- [' || entry.knowledge_type || '] ' || entry.content || E'\n';
  END LOOP;

  RETURN context;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- FUNCTION: Calculate task schedule from dependencies
-- =============================================================================

CREATE OR REPLACE FUNCTION calculate_task_dates(p_task_id UUID)
RETURNS VOID AS $$
DECLARE
  task_record RECORD;
  max_end_date DATE;
  estimated_days INTEGER;
BEGIN
  SELECT * INTO task_record FROM tasks WHERE id = p_task_id;

  -- Find the latest end date of all blockers (for FS dependencies)
  SELECT MAX(
    CASE
      WHEN dep.dependency_type = 'FS' THEN
        COALESCE(blocker.calculated_end_date, blocker.scheduled_end_date, CURRENT_DATE) + dep.lag_days
      WHEN dep.dependency_type = 'SS' THEN
        COALESCE(blocker.calculated_start_date, blocker.scheduled_start_date, CURRENT_DATE) + dep.lag_days
      ELSE CURRENT_DATE
    END
  )
  INTO max_end_date
  FROM task_dependencies dep
  INNER JOIN tasks blocker ON dep.depends_on_task_id = blocker.id
  WHERE dep.task_id = p_task_id;

  -- Calculate estimated duration in days (assume 8 hours/day)
  estimated_days := COALESCE(CEIL(task_record.estimated_hours / 8), 1);

  -- Update calculated dates
  UPDATE tasks
  SET
    calculated_start_date = COALESCE(max_end_date, scheduled_start_date, CURRENT_DATE),
    calculated_end_date = COALESCE(max_end_date, scheduled_start_date, CURRENT_DATE) + estimated_days
  WHERE id = p_task_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- SERVICE ROLE POLICIES
-- =============================================================================

CREATE POLICY "Service role full access to milestones"
  ON milestones FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to task_dependencies"
  ON task_dependencies FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to knowledge_entries"
  ON knowledge_entries FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to time_entries"
  ON time_entries FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to project_linked_items"
  ON project_linked_items FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
