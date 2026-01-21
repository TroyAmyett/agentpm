-- Skills Index Migration
-- Creates a curated, searchable index of approved skills (agent-agnostic)
-- Supports multiple AI agents: Claude, Gemini, GPT, Grok, etc.

-- =============================================================================
-- ENUM TYPES
-- =============================================================================

-- Supported AI agents/platforms
CREATE TYPE skill_agent AS ENUM (
  'universal',   -- Works with any agent
  'claude',      -- Anthropic Claude
  'gemini',      -- Google Gemini
  'gpt',         -- OpenAI GPT
  'grok',        -- xAI Grok
  'llama',       -- Meta Llama
  'mistral',     -- Mistral AI
  'copilot'      -- GitHub Copilot
);

-- Skill categories
CREATE TYPE skill_category AS ENUM (
  'development',     -- Coding, debugging, code review
  'writing',         -- Content creation, documentation
  'analysis',        -- Data analysis, research
  'productivity',    -- Task management, planning
  'design',          -- UI/UX, visual design
  'devops',          -- CI/CD, infrastructure
  'security',        -- Security audits, vulnerability analysis
  'data',            -- Data processing, ETL
  'communication',   -- Email, presentations
  'other'
);

-- Approval status
CREATE TYPE skill_approval_status AS ENUM (
  'pending',     -- Submitted, awaiting review
  'approved',    -- Reviewed and approved
  'rejected',    -- Reviewed and rejected
  'deprecated'   -- Was approved but now outdated
);

-- =============================================================================
-- SKILLS INDEX TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS skills_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ============ BASIC INFO ============
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,  -- URL-friendly identifier
  description TEXT NOT NULL,
  long_description TEXT,               -- Detailed description for detail view

  -- ============ CATEGORIZATION ============
  category skill_category NOT NULL DEFAULT 'other',
  tags TEXT[] DEFAULT '{}',

  -- ============ AUTHORSHIP ============
  author_name VARCHAR(100),
  author_url VARCHAR(500),             -- GitHub profile, website, etc.
  author_verified BOOLEAN DEFAULT FALSE,

  -- ============ SOURCE ============
  github_url VARCHAR(500),             -- Primary source URL
  github_owner VARCHAR(100),
  github_repo VARCHAR(100),
  github_path VARCHAR(500),
  github_branch VARCHAR(100) DEFAULT 'main',
  raw_content_url VARCHAR(500),        -- Direct raw content URL

  -- ============ VERSION TRACKING ============
  version VARCHAR(20) DEFAULT '1.0.0',
  last_commit_sha VARCHAR(40),
  content_hash VARCHAR(64),            -- SHA-256 of content for change detection

  -- ============ AGENT COMPATIBILITY ============
  compatible_agents skill_agent[] DEFAULT '{universal}',
  min_context_window INTEGER,          -- Minimum tokens needed (null = no requirement)
  requires_tools TEXT[] DEFAULT '{}',  -- e.g., ['web_search', 'code_execution']

  -- ============ SKILL FORMAT ============
  format_version VARCHAR(10) DEFAULT '1.0',  -- Skill spec version
  has_conditional_sections BOOLEAN DEFAULT FALSE,  -- Has agent-specific sections

  -- ============ APPROVAL & CURATION ============
  approval_status skill_approval_status DEFAULT 'pending',
  approved_by UUID,                    -- Admin user who approved
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- ============ FEATURING ============
  is_featured BOOLEAN DEFAULT FALSE,
  featured_order INTEGER,              -- Sort order for featured skills
  featured_at TIMESTAMPTZ,

  -- ============ STATS ============
  import_count INTEGER DEFAULT 0,
  star_count INTEGER DEFAULT 0,        -- Future: user ratings

  -- ============ PREVIEW ============
  preview_snippet TEXT,                -- First ~500 chars of content for preview

  -- ============ TIMESTAMPS ============
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,          -- Last time we pulled from GitHub

  -- ============ SOFT DELETE ============
  deleted_at TIMESTAMPTZ,
  deleted_by UUID
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Full-text search on name and description (tags searched separately via GIN)
CREATE INDEX idx_skills_index_search ON skills_index
  USING gin(to_tsvector('english', name || ' ' || description));

-- Category filtering
CREATE INDEX idx_skills_index_category ON skills_index(category)
  WHERE deleted_at IS NULL AND approval_status = 'approved';

-- Agent compatibility filtering (GIN for array containment)
CREATE INDEX idx_skills_index_agents ON skills_index USING gin(compatible_agents)
  WHERE deleted_at IS NULL AND approval_status = 'approved';

-- Tags filtering
CREATE INDEX idx_skills_index_tags ON skills_index USING gin(tags)
  WHERE deleted_at IS NULL AND approval_status = 'approved';

-- Featured skills (sorted)
CREATE INDEX idx_skills_index_featured ON skills_index(featured_order)
  WHERE deleted_at IS NULL AND approval_status = 'approved' AND is_featured = TRUE;

-- Popularity (import count)
CREATE INDEX idx_skills_index_popular ON skills_index(import_count DESC)
  WHERE deleted_at IS NULL AND approval_status = 'approved';

-- Slug lookup
CREATE INDEX idx_skills_index_slug ON skills_index(slug)
  WHERE deleted_at IS NULL;

-- =============================================================================
-- SKILL IMPORT TRACKING
-- =============================================================================

-- Track which users have imported which skills (for stats & updates)
CREATE TABLE IF NOT EXISTS skill_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skills_index_id UUID NOT NULL REFERENCES skills_index(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  account_id UUID NOT NULL,
  user_id UUID,

  -- Import metadata
  imported_version VARCHAR(20),        -- Version at time of import
  imported_at TIMESTAMPTZ DEFAULT NOW(),

  -- Update tracking
  update_available BOOLEAN DEFAULT FALSE,
  last_checked_at TIMESTAMPTZ,

  UNIQUE(skills_index_id, skill_id)
);

CREATE INDEX idx_skill_imports_account ON skill_imports(account_id);
CREATE INDEX idx_skill_imports_index ON skill_imports(skills_index_id);

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Function to increment import count
CREATE OR REPLACE FUNCTION increment_skill_import_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE skills_index
  SET import_count = import_count + 1,
      updated_at = NOW()
  WHERE id = NEW.skills_index_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-increment on import
CREATE TRIGGER trigger_skill_import_count
  AFTER INSERT ON skill_imports
  FOR EACH ROW
  EXECUTE FUNCTION increment_skill_import_count();

-- Function to search skills
CREATE OR REPLACE FUNCTION search_skills_index(
  search_query TEXT DEFAULT NULL,
  filter_category skill_category DEFAULT NULL,
  filter_agent skill_agent DEFAULT NULL,
  filter_tags TEXT[] DEFAULT NULL,
  page_limit INTEGER DEFAULT 20,
  page_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  name VARCHAR(100),
  slug VARCHAR(100),
  description TEXT,
  category skill_category,
  tags TEXT[],
  author_name VARCHAR(100),
  author_verified BOOLEAN,
  github_url VARCHAR(500),
  version VARCHAR(20),
  compatible_agents skill_agent[],
  requires_tools TEXT[],
  is_featured BOOLEAN,
  import_count INTEGER,
  preview_snippet TEXT,
  created_at TIMESTAMPTZ,
  rank REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    si.id,
    si.name,
    si.slug,
    si.description,
    si.category,
    si.tags,
    si.author_name,
    si.author_verified,
    si.github_url,
    si.version,
    si.compatible_agents,
    si.requires_tools,
    si.is_featured,
    si.import_count,
    si.preview_snippet,
    si.created_at,
    CASE
      WHEN search_query IS NOT NULL THEN
        ts_rank(
          to_tsvector('english', si.name || ' ' || si.description || ' ' || array_to_string(si.tags, ' ')),
          plainto_tsquery('english', search_query)
        )
      ELSE 0
    END AS rank
  FROM skills_index si
  WHERE si.deleted_at IS NULL
    AND si.approval_status = 'approved'
    AND (search_query IS NULL OR
         to_tsvector('english', si.name || ' ' || si.description || ' ' || array_to_string(si.tags, ' '))
         @@ plainto_tsquery('english', search_query))
    AND (filter_category IS NULL OR si.category = filter_category)
    AND (filter_agent IS NULL OR filter_agent = ANY(si.compatible_agents) OR 'universal' = ANY(si.compatible_agents))
    AND (filter_tags IS NULL OR si.tags && filter_tags)
  ORDER BY
    si.is_featured DESC,
    CASE WHEN search_query IS NOT NULL THEN rank ELSE 0 END DESC,
    si.import_count DESC,
    si.created_at DESC
  LIMIT page_limit
  OFFSET page_offset;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

ALTER TABLE skills_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_imports ENABLE ROW LEVEL SECURITY;

-- Skills index is publicly readable (approved skills only)
CREATE POLICY "Anyone can view approved skills"
  ON skills_index FOR SELECT
  USING (deleted_at IS NULL AND approval_status = 'approved');

-- Only admins can modify skills_index (handled via service role key)

-- Users can view their own imports
CREATE POLICY "Users can view their own imports"
  ON skill_imports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_accounts
      WHERE user_accounts.account_id = skill_imports.account_id
      AND user_accounts.user_id = auth.uid()
    )
  );

-- Users can create imports for their accounts
CREATE POLICY "Users can create imports for their accounts"
  ON skill_imports FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_accounts
      WHERE user_accounts.account_id = skill_imports.account_id
      AND user_accounts.user_id = auth.uid()
    )
  );

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE skills_index IS 'Curated index of approved skills for discovery and import';
COMMENT ON COLUMN skills_index.compatible_agents IS 'Array of AI agents this skill is compatible with';
COMMENT ON COLUMN skills_index.min_context_window IS 'Minimum context window in tokens required for this skill';
COMMENT ON COLUMN skills_index.requires_tools IS 'Array of tool/capability names required (e.g., web_search, file_system)';
COMMENT ON COLUMN skills_index.format_version IS 'Version of the skill format specification';
COMMENT ON COLUMN skills_index.has_conditional_sections IS 'Whether the skill contains agent-specific conditional sections';

-- =============================================================================
-- SEED DATA: Example approved skills
-- =============================================================================

INSERT INTO skills_index (
  name, slug, description, long_description, category, tags,
  author_name, author_verified,
  github_url, github_owner, github_repo, github_path,
  version, compatible_agents, requires_tools,
  approval_status, approved_at, is_featured, featured_order,
  preview_snippet
) VALUES
(
  'Code Review',
  'code-review',
  'Perform thorough code reviews with security, performance, and best practice checks',
  'A comprehensive code review skill that helps identify bugs, security vulnerabilities, performance issues, and style inconsistencies. Works with any programming language and follows industry best practices.',
  'development',
  ARRAY['code-review', 'security', 'quality', 'best-practices'],
  'Funnelists',
  TRUE,
  'https://github.com/funnelists/skills/blob/main/development/code-review.md',
  'funnelists', 'skills', 'development/code-review.md',
  '1.0.0',
  ARRAY['universal']::skill_agent[],
  ARRAY['file_read'],
  'approved', NOW(), TRUE, 1,
  '# Code Review\n\n## When to Use This Skill\n\n- Reviewing pull requests\n- Checking code quality before merge\n- Learning best practices from code examples\n- Security auditing...'
),
(
  'Project Planning',
  'project-planning',
  'Create comprehensive project plans with tasks, milestones, and dependencies',
  'Transform project requirements into structured plans with clear phases, task breakdowns, dependency mapping, and realistic timelines. Ideal for software projects, product launches, and team initiatives.',
  'productivity',
  ARRAY['planning', 'project-management', 'agile', 'tasks'],
  'Funnelists',
  TRUE,
  'https://github.com/funnelists/skills/blob/main/productivity/project-planning.md',
  'funnelists', 'skills', 'productivity/project-planning.md',
  '1.0.0',
  ARRAY['universal']::skill_agent[],
  ARRAY[]::TEXT[],
  'approved', NOW(), TRUE, 2,
  '# Project Planning\n\n## When to Use This Skill\n\n- Starting a new project and need to break it down\n- Creating a roadmap with milestones\n- Identifying dependencies between tasks...'
),
(
  'API Documentation',
  'api-documentation',
  'Generate OpenAPI specs and comprehensive API documentation from code',
  'Automatically analyze API endpoints and generate well-structured documentation including request/response schemas, authentication details, error codes, and usage examples. Outputs in OpenAPI 3.0 format.',
  'development',
  ARRAY['documentation', 'api', 'openapi', 'swagger', 'rest'],
  'Funnelists',
  TRUE,
  'https://github.com/funnelists/skills/blob/main/development/api-documentation.md',
  'funnelists', 'skills', 'development/api-documentation.md',
  '1.0.0',
  ARRAY['universal']::skill_agent[],
  ARRAY['file_read'],
  'approved', NOW(), TRUE, 3,
  '# API Documentation\n\n## When to Use This Skill\n\n- Documenting REST APIs\n- Generating OpenAPI/Swagger specs\n- Creating API reference guides...'
),
(
  'Git Commit Craft',
  'git-commit-craft',
  'Write clear, conventional commit messages following best practices',
  'Analyzes staged changes and generates meaningful commit messages following Conventional Commits specification. Supports semantic versioning hints and multi-line descriptions for complex changes.',
  'development',
  ARRAY['git', 'commits', 'conventional-commits', 'version-control'],
  'Funnelists',
  TRUE,
  'https://github.com/funnelists/skills/blob/main/development/git-commit-craft.md',
  'funnelists', 'skills', 'development/git-commit-craft.md',
  '1.0.0',
  ARRAY['universal']::skill_agent[],
  ARRAY['code_execution'],
  'approved', NOW(), FALSE, NULL,
  '# Git Commit Craft\n\n## When to Use This Skill\n\n- Creating commit messages for staged changes\n- Following Conventional Commits format\n- Writing clear change descriptions...'
),
(
  'SQL Query Builder',
  'sql-query-builder',
  'Generate optimized SQL queries from natural language descriptions',
  'Transform plain English descriptions into efficient SQL queries. Supports complex JOINs, aggregations, window functions, and CTEs. Includes query optimization suggestions and explains the generated SQL.',
  'data',
  ARRAY['sql', 'database', 'queries', 'data-analysis'],
  'Funnelists',
  TRUE,
  'https://github.com/funnelists/skills/blob/main/data/sql-query-builder.md',
  'funnelists', 'skills', 'data/sql-query-builder.md',
  '1.0.0',
  ARRAY['universal']::skill_agent[],
  ARRAY[]::TEXT[],
  'approved', NOW(), FALSE, NULL,
  '# SQL Query Builder\n\n## When to Use This Skill\n\n- Converting natural language to SQL\n- Building complex queries with JOINs and aggregations\n- Optimizing existing queries...'
),
(
  'Claude Code Expert',
  'claude-code-expert',
  'Specialized prompts and techniques for Claude Code CLI',
  'Optimized instructions for working with Claude Code, including effective prompting patterns, tool usage tips, and workflow automation. Takes advantage of Claude-specific capabilities.',
  'development',
  ARRAY['claude', 'cli', 'anthropic', 'prompting'],
  'Funnelists',
  TRUE,
  'https://github.com/funnelists/skills/blob/main/development/claude-code-expert.md',
  'funnelists', 'skills', 'development/claude-code-expert.md',
  '1.0.0',
  ARRAY['claude']::skill_agent[],
  ARRAY['code_execution', 'file_read', 'file_write'],
  'approved', NOW(), TRUE, 4,
  '# Claude Code Expert\n\n## When to Use This Skill\n\n- Working with Claude Code CLI\n- Optimizing prompts for Claude\n- Automating development workflows...'
)
ON CONFLICT (slug) DO NOTHING;
