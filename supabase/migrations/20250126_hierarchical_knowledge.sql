-- Hierarchical Knowledge System Migration
-- Adds support for Global, Account, Team, and Project level knowledge

-- =============================================================================
-- SYSTEM_KNOWLEDGE TABLE (Global Level - Applies to ALL users)
-- =============================================================================
-- This table stores Funnelists platform knowledge that all users need
-- Example: How AgentPM works, what Canvas does, how tools integrate

CREATE TABLE IF NOT EXISTS system_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Categorization
  category TEXT NOT NULL, -- 'platform', 'tool', 'integration', 'workflow', 'best-practice'
  tool_name TEXT, -- 'agentpm', 'canvas', 'radar', 'leadgen', NULL for general

  -- Content
  title TEXT NOT NULL,
  content TEXT NOT NULL,

  -- Metadata
  tags TEXT[] DEFAULT '{}',
  priority INTEGER DEFAULT 100, -- Lower = higher priority (shown first)

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID
);

-- Indexes for system_knowledge
CREATE INDEX IF NOT EXISTS idx_system_knowledge_category ON system_knowledge(category);
CREATE INDEX IF NOT EXISTS idx_system_knowledge_tool_name ON system_knowledge(tool_name);
CREATE INDEX IF NOT EXISTS idx_system_knowledge_priority ON system_knowledge(priority);
CREATE INDEX IF NOT EXISTS idx_system_knowledge_tags ON system_knowledge USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_system_knowledge_active ON system_knowledge(is_active);

-- Full-text search on content
CREATE INDEX IF NOT EXISTS idx_system_knowledge_content_search
  ON system_knowledge USING GIN(to_tsvector('english', title || ' ' || content));

-- RLS for system_knowledge (read-only for authenticated users)
ALTER TABLE system_knowledge ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read active system knowledge
CREATE POLICY "Authenticated users can view active system knowledge"
  ON system_knowledge FOR SELECT
  TO authenticated
  USING (is_active = TRUE);

-- Only service role can modify (admin access via backend)
CREATE POLICY "Service role full access to system_knowledge"
  ON system_knowledge FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Trigger for updated_at
CREATE TRIGGER update_system_knowledge_updated_at
  BEFORE UPDATE ON system_knowledge
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- EXTEND KNOWLEDGE_ENTRIES TABLE (Account/Team/Project Levels)
-- =============================================================================

-- Add scope column to knowledge_entries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'knowledge_entries' AND column_name = 'scope'
  ) THEN
    -- Add scope column
    ALTER TABLE knowledge_entries
      ADD COLUMN scope TEXT NOT NULL DEFAULT 'project'
      CHECK (scope IN ('account', 'team', 'project'));

    -- Make project_id nullable (for account-level knowledge)
    ALTER TABLE knowledge_entries
      ALTER COLUMN project_id DROP NOT NULL;

    -- Add team_id column for team-scoped knowledge (future use)
    ALTER TABLE knowledge_entries
      ADD COLUMN team_id UUID;

    -- Add constraint: project_id required for project-scope
    ALTER TABLE knowledge_entries
      ADD CONSTRAINT knowledge_scope_project_check
      CHECK (scope != 'project' OR project_id IS NOT NULL);

    -- Add constraint: team_id required for team-scope (when implemented)
    -- For now, team scope just uses account_id

    RAISE NOTICE 'Added scope, team_id columns and made project_id nullable';
  ELSE
    RAISE NOTICE 'Scope column already exists on knowledge_entries';
  END IF;
END $$;

-- Index for scope
CREATE INDEX IF NOT EXISTS idx_knowledge_entries_scope ON knowledge_entries(scope);
CREATE INDEX IF NOT EXISTS idx_knowledge_entries_team_id ON knowledge_entries(team_id);

-- Index for account-level knowledge lookup
CREATE INDEX IF NOT EXISTS idx_knowledge_entries_account_scope
  ON knowledge_entries(account_id, scope)
  WHERE deleted_at IS NULL;

-- =============================================================================
-- UPDATE RLS POLICIES FOR KNOWLEDGE_ENTRIES
-- =============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view knowledge in their account" ON knowledge_entries;
DROP POLICY IF EXISTS "Users can insert knowledge in their account" ON knowledge_entries;
DROP POLICY IF EXISTS "Users can update knowledge in their account" ON knowledge_entries;

-- New policy: View all knowledge in user's account (account, team, and project level)
CREATE POLICY "Users can view knowledge in their account"
  ON knowledge_entries FOR SELECT
  USING (user_is_account_member(account_id) AND deleted_at IS NULL);

-- New policy: Insert knowledge in user's account
CREATE POLICY "Users can insert knowledge in their account"
  ON knowledge_entries FOR INSERT
  WITH CHECK (user_is_account_member(account_id));

-- New policy: Update knowledge in user's account
CREATE POLICY "Users can update knowledge in their account"
  ON knowledge_entries FOR UPDATE
  USING (user_is_account_member(account_id) AND deleted_at IS NULL)
  WITH CHECK (user_is_account_member(account_id));

-- =============================================================================
-- FUNCTION: Get Hierarchical Knowledge for AI Context
-- =============================================================================

-- Function to build knowledge context from all levels
CREATE OR REPLACE FUNCTION get_hierarchical_knowledge_context(
  p_account_id UUID,
  p_project_id UUID DEFAULT NULL,
  p_tool_name TEXT DEFAULT 'agentpm'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  context TEXT := '';
  entry RECORD;
  current_section TEXT := '';
BEGIN
  -- 1. GLOBAL LEVEL: System knowledge for the current tool
  context := context || E'## SYSTEM KNOWLEDGE\n';
  context := context || E'This is how the Funnelists platform works:\n\n';

  FOR entry IN
    SELECT title, content, category
    FROM system_knowledge
    WHERE is_active = TRUE
      AND (tool_name IS NULL OR tool_name = p_tool_name)
    ORDER BY priority, category, created_at
  LOOP
    context := context || '### ' || entry.title || E'\n';
    context := context || entry.content || E'\n\n';
  END LOOP;

  -- 2. ACCOUNT LEVEL: Account-wide knowledge
  IF p_account_id IS NOT NULL THEN
    context := context || E'\n## ACCOUNT KNOWLEDGE\n';
    context := context || E'Knowledge specific to this organization:\n\n';

    FOR entry IN
      SELECT knowledge_type, content
      FROM knowledge_entries
      WHERE account_id = p_account_id
        AND scope = 'account'
        AND deleted_at IS NULL
        AND is_verified = TRUE
      ORDER BY knowledge_type, created_at
    LOOP
      IF current_section != entry.knowledge_type THEN
        current_section := entry.knowledge_type;
        context := context || '### ' || INITCAP(current_section) || E's\n';
      END IF;
      context := context || '- ' || entry.content || E'\n';
    END LOOP;
  END IF;

  -- 3. PROJECT LEVEL: Project-specific knowledge
  IF p_project_id IS NOT NULL THEN
    context := context || E'\n## PROJECT KNOWLEDGE\n';
    context := context || E'Knowledge specific to this project:\n\n';

    current_section := '';
    FOR entry IN
      SELECT knowledge_type, content
      FROM knowledge_entries
      WHERE project_id = p_project_id
        AND scope = 'project'
        AND deleted_at IS NULL
        AND is_verified = TRUE
      ORDER BY knowledge_type, created_at
    LOOP
      IF current_section != entry.knowledge_type THEN
        current_section := entry.knowledge_type;
        context := context || '### ' || INITCAP(current_section) || E's\n';
      END IF;
      context := context || '- ' || entry.content || E'\n';
    END LOOP;
  END IF;

  RETURN context;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_hierarchical_knowledge_context(UUID, UUID, TEXT) TO authenticated;

-- =============================================================================
-- SEED: Initial System Knowledge (Funnelists Platform)
-- =============================================================================

-- Clear existing system knowledge (for idempotent migration)
DELETE FROM system_knowledge WHERE category IN ('platform', 'tool', 'workflow');

-- Platform overview
INSERT INTO system_knowledge (category, tool_name, title, content, priority, tags) VALUES
('platform', NULL, 'Funnelists Platform Overview',
'Funnelists is a suite of AI-powered tools for businesses:

1. **AgentPM** - AI Project Management with autonomous agents that handle tasks
2. **Canvas** - AI Brand Image Generator for creating on-brand visuals
3. **Radar** - Content discovery and research aggregator
4. **LeadGen** - Lead generation and prospecting tool

All tools share:
- Unified authentication (sign in once, access all tools)
- Shared account and user management
- Cross-tool API key storage
- Consistent dark theme UI design',
10, ARRAY['overview', 'getting-started']);

-- AgentPM tool knowledge
INSERT INTO system_knowledge (category, tool_name, title, content, priority, tags) VALUES
('tool', 'agentpm', 'AgentPM Overview',
'AgentPM is an AI Project Management system with autonomous AI agents.

**Core Concepts:**
- **Projects** - Containers for tasks, knowledge, and notes
- **Tasks** - Work items that can be assigned to users or AI agents
- **Agents** - AI personas (Maverick, Pixel, Scout, Sentinel, Atlas, Forge) that execute tasks
- **Knowledge** - Facts, decisions, and constraints that inform AI work
- **Skills** - Reusable prompts and instructions for agents

**Task Workflow:**
1. Inbox (draft) → 2. Ready (pending) → 3. Queued → 4. In Progress → 5. Review → 6. Done

**Key Agents:**
- **Atlas** (Orchestrator) - Routes tasks and coordinates other agents
- **Maverick** (Content Writer) - Creates written content
- **Pixel** (Image Generator) - Creates visuals using Canvas
- **Scout** (Researcher) - Gathers information from the web
- **Sentinel** (QA Tester) - Reviews and validates work
- **Forge** (Developer) - Implements PRDs in code',
20, ARRAY['agentpm', 'agents', 'tasks']);

-- AgentPM Planner knowledge
INSERT INTO system_knowledge (category, tool_name, title, content, priority, tags) VALUES
('tool', 'agentpm', 'Planner View',
'The Planner is where users capture ideas and plan work using notes.

**Features:**
- **Notes** - Markdown documents organized in folders
- **AI Chat** - Assistant that helps brainstorm and develop ideas
- **Task Extraction** - AI can extract actionable tasks from notes
- **Project Linking** - Notes can be linked to projects

**Using the AI Chat:**
- Ask questions about your note content
- Request help expanding or refining ideas
- Use "Add this to my note" to update content
- Create new notes from chat conversations',
25, ARRAY['planner', 'notes', 'chat']);

-- AgentPM Kanban knowledge
INSERT INTO system_knowledge (category, tool_name, title, content, priority, tags) VALUES
('tool', 'agentpm', 'Kanban View',
'The Kanban board shows all tasks organized by status.

**Columns:**
- **Inbox** - New tasks being refined (safe zone)
- **Ready** - Approved tasks waiting to be worked
- **Queued** - Assigned to an agent, waiting in line
- **In Progress** - Currently being worked by an agent
- **Review** - Completed by agent, awaiting human review
- **Done** - Approved and completed

**Task Actions:**
- Drag tasks between columns to change status
- Click to open task details
- Assign agents from the dropdown
- View execution output in the detail panel',
26, ARRAY['kanban', 'tasks', 'workflow']);

-- AgentPM execution knowledge
INSERT INTO system_knowledge (category, tool_name, title, content, priority, tags) VALUES
('tool', 'agentpm', 'Task Execution',
'When an AI agent executes a task:

1. Task moves from Queued → In Progress
2. Agent reads task title, description, and skill (if assigned)
3. Agent has access to project knowledge entries
4. Agent may use tools (web search, etc.) as needed
5. Agent produces output (text, code, etc.)
6. Task moves to Review for human approval

**Subtasks:**
- Tasks can be decomposed into subtasks
- Subtasks execute in parallel or sequentially based on dependencies
- When all subtasks complete, outputs are aggregated to parent task
- Parent task moves to Review after aggregation',
27, ARRAY['execution', 'agents', 'workflow']);

-- Canvas tool knowledge
INSERT INTO system_knowledge (category, tool_name, title, content, priority, tags) VALUES
('tool', 'canvas', 'Canvas Overview',
'Canvas is an AI Brand Image Generator.

**Features:**
- Generate images using AI (DALL-E, Stability AI)
- Multiple style presets and themes
- Brand color integration
- Image history and favorites

**How to use:**
1. Enter a prompt describing the image
2. Select a style preset
3. Choose provider and model
4. Click Generate
5. Download or save to history',
30, ARRAY['canvas', 'images', 'ai']);

-- Radar tool knowledge
INSERT INTO system_knowledge (category, tool_name, title, content, priority, tags) VALUES
('tool', 'radar', 'Radar Overview',
'Radar is a content discovery and research aggregator.

**Features:**
- Subscribe to RSS feeds, podcasts, YouTube channels
- AI-powered content summarization
- Topic filtering and categorization
- Deep dive mode for detailed analysis

**Use cases:**
- Monitor industry news
- Track competitor content
- Research topics for content creation
- Curate learning resources',
35, ARRAY['radar', 'research', 'content']);

-- Workflow best practices
INSERT INTO system_knowledge (category, tool_name, title, content, priority, tags) VALUES
('workflow', 'agentpm', 'Best Practices for Tasks',
'Tips for creating effective tasks:

**Task Titles:**
- Be specific and action-oriented
- Start with a verb (Create, Update, Review, etc.)
- Include key context (e.g., "Write blog post about AI trends")

**Task Descriptions:**
- Provide clear requirements
- Include acceptance criteria
- Reference relevant knowledge entries
- Link related resources or examples

**Assigning Skills:**
- Select skills that match the task type
- Skills provide agents with specialized instructions
- Custom skills can be created for repeated task types',
50, ARRAY['best-practices', 'tasks']);

-- Integration knowledge
INSERT INTO system_knowledge (category, tool_name, title, content, priority, tags) VALUES
('workflow', 'agentpm', 'Cross-Tool Integration',
'Funnelists tools work together:

**Canvas + AgentPM:**
- Pixel agent can generate images via Canvas API
- Image tasks automatically use Canvas providers

**Radar + AgentPM:**
- Scout agent uses Radar for research
- Content from Radar can inform task context

**Shared Resources:**
- API keys stored centrally
- User preferences sync across tools
- Changelog tracks updates across all tools',
55, ARRAY['integration', 'workflow']);

-- Comment
COMMENT ON TABLE system_knowledge IS 'Global knowledge about Funnelists platform - read by all users, managed by admins';
COMMENT ON COLUMN knowledge_entries.scope IS 'Knowledge scope: account (org-wide), team (department), project (specific project)';
