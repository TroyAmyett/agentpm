-- =============================================================================
-- COMBINED MIGRATIONS - Run this single file in Supabase
-- Date: 2025-01-22
-- =============================================================================

-- =============================================================================
-- PART 1: FIX TASK DELETE POLICY (fixes 403 error on task deletion)
-- =============================================================================

-- Drop the existing policy
DROP POLICY IF EXISTS "Users can update tasks in their account" ON tasks;

-- Recreate with explicit WITH CHECK that allows setting deleted_at
CREATE POLICY "Users can update tasks in their account"
  ON tasks FOR UPDATE
  USING (account_id = get_user_account_id() AND deleted_at IS NULL)
  WITH CHECK (account_id = get_user_account_id());

-- Also ensure milestones and knowledge_entries have proper delete support
DROP POLICY IF EXISTS "Users can update milestones in their account" ON milestones;
CREATE POLICY "Users can update milestones in their account"
  ON milestones FOR UPDATE
  USING (account_id = get_user_account_id() AND deleted_at IS NULL)
  WITH CHECK (account_id = get_user_account_id());

DROP POLICY IF EXISTS "Users can update knowledge in their account" ON knowledge_entries;
CREATE POLICY "Users can update knowledge in their account"
  ON knowledge_entries FOR UPDATE
  USING (account_id = get_user_account_id() AND deleted_at IS NULL)
  WITH CHECK (account_id = get_user_account_id());

-- Part 1 complete: Task delete policy fixed

-- =============================================================================
-- PART 2: MOVE AGENTS TO FUNNELISTS + SEED NEW AGENTS AND SKILLS
-- =============================================================================

DO $$
DECLARE
  funnelists_account_id UUID;
  system_user_id UUID := '00000000-0000-0000-0000-000000000000';

  -- Agent UUIDs (fixed for consistency)
  agent_chief_id UUID := '00000000-0000-0000-0000-000000000011';  -- Chief of Staff (Orchestrator)
  agent_maverick_id UUID := '00000000-0000-0000-0000-000000000001';  -- Content Writer
  agent_pixel_id UUID := '00000000-0000-0000-0000-000000000002';  -- Image Generator
  agent_scout_id UUID := '00000000-0000-0000-0000-000000000003';  -- Researcher
  agent_sentinel_id UUID := '00000000-0000-0000-0000-000000000004';  -- QA Tester
  agent_forge_id UUID := '00000000-0000-0000-0000-000000000006';  -- Developer
  agent_radar_id UUID := '00000000-0000-0000-0000-000000000007';  -- Market Intelligence
  agent_scribe_id UUID := '00000000-0000-0000-0000-000000000008';  -- Documentation
  agent_herald_id UUID := '00000000-0000-0000-0000-000000000009';  -- Social Media
BEGIN
  -- Find the Funnelists account
  SELECT id INTO funnelists_account_id
  FROM accounts
  WHERE LOWER(name) = 'funnelists' OR LOWER(slug) = 'funnelists'
  LIMIT 1;

  IF funnelists_account_id IS NULL THEN
    RAISE NOTICE 'Funnelists account not found. Skipping agent seed.';
    RETURN;
  END IF;

  RAISE NOTICE 'Seeding agents for Funnelists account: %', funnelists_account_id;

  -- =============================================================================
  -- AGENTS - The Funnelists Team
  -- =============================================================================

  -- Delete agents with these specific IDs (they may exist in a different account)
  DELETE FROM agent_personas WHERE id IN (
    agent_chief_id,
    agent_maverick_id,
    agent_pixel_id,
    agent_scout_id,
    agent_sentinel_id,
    agent_forge_id,
    agent_radar_id,
    agent_scribe_id,
    agent_herald_id
  );

  INSERT INTO agent_personas (
    id, account_id, agent_type, alias, tagline, description,
    capabilities, restrictions, triggers,
    autonomy_level, requires_approval,
    can_spawn_agents, can_modify_self,
    consecutive_failures, max_consecutive_failures, health_status,
    is_active, show_on_dashboard, show_in_org_chart, sort_order,
    reports_to,
    created_by, created_by_type, updated_by, updated_by_type
  ) VALUES

  -- Chief of Staff (Orchestrator) - Reports to human owner
  (
    agent_chief_id,
    funnelists_account_id,
    'orchestrator',
    'Atlas',
    'Chief of Staff - Mission Control',
    'Atlas coordinates the entire Funnelists agent team. He routes tasks to the right agents, monitors progress, and ensures quality delivery. Think of him as your executive assistant who manages the team.',
    ARRAY['route-tasks', 'coordinate-agents', 'monitor', 'prioritize', 'schedule', 'report-status'],
    ARRAY['write-content', 'publish', 'commit-code'],
    ARRAY['task-queue', 'schedule:hourly', 'manual'],
    'semi-autonomous',
    ARRAY['spawn-agent', 'reassign-task', 'cancel-task'],
    TRUE, FALSE,
    0, 5, 'healthy',
    TRUE, TRUE, TRUE, 1,
    NULL,
    system_user_id, 'agent', system_user_id, 'agent'
  ),

  -- Maverick - Content Writer
  (
    agent_maverick_id,
    funnelists_account_id,
    'content-writer',
    'Maverick',
    'Salesforce Content Specialist',
    'Maverick creates compelling content about Salesforce, Agentforce, and the broader ecosystem. From blog posts to documentation, whitepapers to tutorials.',
    ARRAY['web-research', 'write-content', 'edit-content', 'seo-optimize', 'generate-outlines', 'create-tutorials'],
    ARRAY['edit-production', 'delete-records', 'publish-without-review'],
    ARRAY['manual', 'task-queue'],
    'semi-autonomous',
    ARRAY['publish', 'delete', 'send-email'],
    FALSE, FALSE,
    0, 5, 'healthy',
    TRUE, TRUE, TRUE, 2,
    jsonb_build_object('id', agent_chief_id, 'type', 'agent', 'name', 'Atlas'),
    system_user_id, 'agent', system_user_id, 'agent'
  ),

  -- Pixel - Image Generator
  (
    agent_pixel_id,
    funnelists_account_id,
    'image-generator',
    'Pixel',
    'Visual Designer',
    'Pixel creates on-brand visuals for Funnelists. Blog headers, social media graphics, diagrams, and illustrations.',
    ARRAY['generate-images', 'edit-images', 'create-diagrams', 'design-graphics', 'brand-consistency'],
    ARRAY['delete-records', 'modify-brand-guidelines'],
    ARRAY['manual', 'task-queue'],
    'semi-autonomous',
    ARRAY['publish'],
    FALSE, FALSE,
    0, 5, 'healthy',
    TRUE, TRUE, TRUE, 3,
    jsonb_build_object('id', agent_chief_id, 'type', 'agent', 'name', 'Atlas'),
    system_user_id, 'agent', system_user_id, 'agent'
  ),

  -- Scout - Researcher
  (
    agent_scout_id,
    funnelists_account_id,
    'researcher',
    'Scout',
    'Salesforce Intelligence Analyst',
    'Scout monitors the Salesforce ecosystem for news, updates, trends, and competitive intelligence.',
    ARRAY['web-research', 'summarize', 'report', 'track-competitors', 'monitor-releases', 'analyze-trends'],
    ARRAY['write-content', 'publish'],
    ARRAY['manual', 'task-queue', 'schedule:daily'],
    'autonomous',
    ARRAY[]::TEXT[],
    FALSE, FALSE,
    0, 5, 'healthy',
    TRUE, TRUE, TRUE, 4,
    jsonb_build_object('id', agent_chief_id, 'type', 'agent', 'name', 'Atlas'),
    system_user_id, 'agent', system_user_id, 'agent'
  ),

  -- Radar - Market Intelligence
  (
    agent_radar_id,
    funnelists_account_id,
    'researcher',
    'Radar',
    'Market Intelligence Specialist',
    'Radar tracks the broader CRM and AI agent market. Monitors competitors like HubSpot, Microsoft Copilot, and emerging AI agent platforms.',
    ARRAY['web-research', 'competitive-analysis', 'market-research', 'trend-analysis', 'report-generation'],
    ARRAY['write-content', 'publish'],
    ARRAY['manual', 'task-queue', 'schedule:weekly'],
    'autonomous',
    ARRAY[]::TEXT[],
    FALSE, FALSE,
    0, 5, 'healthy',
    TRUE, TRUE, TRUE, 5,
    jsonb_build_object('id', agent_chief_id, 'type', 'agent', 'name', 'Atlas'),
    system_user_id, 'agent', system_user_id, 'agent'
  ),

  -- Forge - Developer Agent
  (
    agent_forge_id,
    funnelists_account_id,
    'forge',
    'Forge',
    'Full-Stack Developer',
    'Forge implements features and fixes bugs in the Funnelists codebase. Takes PRDs and turns them into working code.',
    ARRAY['read-code', 'write-code', 'run-tests', 'create-pr', 'fix-bugs', 'implement-features', 'refactor'],
    ARRAY['deploy-production', 'delete-database', 'modify-secrets'],
    ARRAY['manual', 'task-queue'],
    'semi-autonomous',
    ARRAY['deploy', 'delete', 'modify-infrastructure'],
    FALSE, FALSE,
    0, 5, 'healthy',
    TRUE, TRUE, TRUE, 6,
    jsonb_build_object('id', agent_chief_id, 'type', 'agent', 'name', 'Atlas'),
    system_user_id, 'agent', system_user_id, 'agent'
  ),

  -- Sentinel - QA Tester
  (
    agent_sentinel_id,
    funnelists_account_id,
    'qa-tester',
    'Sentinel',
    'Quality Assurance Guardian',
    'Sentinel ensures everything Funnelists ships is high quality. Reviews content, tests code, validates deliverables.',
    ARRAY['test', 'validate', 'report-issues', 'review-content', 'check-links', 'verify-accuracy'],
    ARRAY['write-content', 'publish', 'commit-code'],
    ARRAY['manual', 'task-queue', 'schedule:daily'],
    'autonomous',
    ARRAY[]::TEXT[],
    FALSE, FALSE,
    0, 5, 'healthy',
    TRUE, TRUE, TRUE, 7,
    jsonb_build_object('id', agent_chief_id, 'type', 'agent', 'name', 'Atlas'),
    system_user_id, 'agent', system_user_id, 'agent'
  ),

  -- Scribe - Documentation
  (
    agent_scribe_id,
    funnelists_account_id,
    'content-writer',
    'Scribe',
    'Technical Documentation Specialist',
    'Scribe maintains all technical documentation. API docs, user guides, internal wikis.',
    ARRAY['write-documentation', 'generate-api-docs', 'create-guides', 'maintain-wiki', 'document-code'],
    ARRAY['delete-records', 'publish-without-review'],
    ARRAY['manual', 'task-queue'],
    'semi-autonomous',
    ARRAY['publish'],
    FALSE, FALSE,
    0, 5, 'healthy',
    TRUE, TRUE, TRUE, 8,
    jsonb_build_object('id', agent_chief_id, 'type', 'agent', 'name', 'Atlas'),
    system_user_id, 'agent', system_user_id, 'agent'
  ),

  -- Herald - Social Media
  (
    agent_herald_id,
    funnelists_account_id,
    'content-writer',
    'Herald',
    'Social Media Manager',
    'Herald manages the Funnelists social media presence. Crafts posts for LinkedIn, Twitter/X to engage the Salesforce community.',
    ARRAY['write-social-posts', 'schedule-posts', 'engage-community', 'track-analytics', 'hashtag-research'],
    ARRAY['delete-account', 'modify-profile', 'dm-users'],
    ARRAY['manual', 'task-queue', 'schedule:daily'],
    'semi-autonomous',
    ARRAY['publish', 'engage-users'],
    FALSE, FALSE,
    0, 5, 'healthy',
    TRUE, TRUE, TRUE, 9,
    jsonb_build_object('id', agent_chief_id, 'type', 'agent', 'name', 'Atlas'),
    system_user_id, 'agent', system_user_id, 'agent'
  );

  RAISE NOTICE 'Created 9 agents for Funnelists';

  -- =============================================================================
  -- SKILLS - Funnelists Specialized Skills
  -- =============================================================================

  -- Delete existing skills for this account
  DELETE FROM skills WHERE account_id = funnelists_account_id;

  INSERT INTO skills (
    account_id, name, slug, description, content, icon, category, tags, is_enabled, is_org_shared
  ) VALUES

  (
    funnelists_account_id,
    'Salesforce Blog Post',
    'salesforce-blog-post',
    'Write engaging blog posts about Salesforce features, best practices, and ecosystem news',
    E'You are writing a blog post for Funnelists, a Salesforce-focused content platform.\n\nGuidelines:\n- Target audience: Salesforce admins, developers, and business users\n- Tone: Professional yet approachable, with technical depth\n- Include practical examples and code snippets where relevant\n- Reference official Salesforce documentation\n- SEO optimized with relevant keywords\n- 1500-2500 words typical length',
    'pencil',
    'Content',
    ARRAY['salesforce', 'blog', 'content', 'writing'],
    TRUE, TRUE
  ),

  (
    funnelists_account_id,
    'Agentforce Tutorial',
    'agentforce-tutorial',
    'Create step-by-step tutorials for building Agentforce agents and actions',
    E'You are creating a tutorial for Funnelists about Salesforce Agentforce.\n\nGuidelines:\n- Assume reader has basic Salesforce knowledge\n- Include all prerequisite steps\n- Provide complete, working code examples\n- Include screenshots for UI steps\n- Test all code before publishing',
    'graduation-cap',
    'Content',
    ARRAY['agentforce', 'tutorial', 'development', 'salesforce'],
    TRUE, TRUE
  ),

  (
    funnelists_account_id,
    'Competitor Analysis',
    'competitor-analysis',
    'Research and analyze competitors in the CRM and AI agent space',
    E'Conduct competitor analysis for Funnelists.\n\nFocus Areas:\n- CRM platforms: HubSpot, Microsoft Dynamics, Zoho\n- AI Agent platforms: Microsoft Copilot, ServiceNow, Zendesk AI\n- Salesforce ecosystem competitors',
    'target',
    'Research',
    ARRAY['competitors', 'analysis', 'market', 'research'],
    TRUE, TRUE
  ),

  (
    funnelists_account_id,
    'Salesforce Ecosystem Monitor',
    'sf-ecosystem-monitor',
    'Monitor Salesforce ecosystem for news, updates, and community activity',
    E'Monitor the Salesforce ecosystem for Funnelists.\n\nSources:\n- Salesforce official blog and releases\n- Trailhead updates\n- AppExchange new listings\n- Salesforce Twitter/X accounts\n- r/salesforce subreddit',
    'radio-tower',
    'Research',
    ARRAY['salesforce', 'monitoring', 'ecosystem', 'news'],
    TRUE, TRUE
  ),

  (
    funnelists_account_id,
    'LinkedIn Salesforce Post',
    'linkedin-sf-post',
    'Create engaging LinkedIn posts about Salesforce topics',
    E'Create LinkedIn posts for Funnelists.\n\nGuidelines:\n- Hook in first line (before "see more")\n- Professional but personable tone\n- Include relevant hashtags (3-5)\n- Optimal length: 1200-1500 characters\n- Include call-to-action',
    'linkedin',
    'Social',
    ARRAY['linkedin', 'social-media', 'salesforce', 'marketing'],
    TRUE, TRUE
  ),

  (
    funnelists_account_id,
    'Content Accuracy Review',
    'content-accuracy-review',
    'Review content for technical accuracy and Salesforce correctness',
    E'Review Funnelists content for accuracy.\n\nChecklist:\n- API names and syntax correct\n- Feature availability (edition, permissions)\n- Version-specific information noted\n- Links working and current\n- Screenshots match current UI',
    'check-circle',
    'Quality',
    ARRAY['qa', 'review', 'accuracy', 'content'],
    TRUE, TRUE
  );

  RAISE NOTICE 'Created 6 skills for Funnelists';

END $$;

-- =============================================================================
-- PART 3: ADD SKILL_ID TO TASKS TABLE
-- =============================================================================

-- Add skill_id column to tasks for skill integration
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS skill_id UUID REFERENCES skills(id);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_tasks_skill_id ON tasks(skill_id);

-- Part 3 complete: skill_id added to tasks

-- =============================================================================
-- DONE
-- =============================================================================
SELECT 'All migrations complete!' as status;
