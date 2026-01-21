-- =============================================================================
-- SKILLS BUILDER ENHANCEMENTS
-- Adds forked_from tracking and builder_conversation storage
-- Date: 2025-01-21
-- =============================================================================

-- Add forked_from column to track skill lineage
ALTER TABLE skills
ADD COLUMN IF NOT EXISTS forked_from UUID REFERENCES skills(id) ON DELETE SET NULL;

-- Add builder_conversation column to store the AI chat that created/modified the skill
ALTER TABLE skills
ADD COLUMN IF NOT EXISTS builder_conversation JSONB;

-- Add namespace column for official vs custom skills (@fun/, @user/, etc.)
ALTER TABLE skills
ADD COLUMN IF NOT EXISTS namespace VARCHAR(100);

-- Index for forked_from queries (find all forks of a skill)
CREATE INDEX IF NOT EXISTS idx_skills_forked_from ON skills(forked_from);

-- Index for namespace queries
CREATE INDEX IF NOT EXISTS idx_skills_namespace ON skills(namespace);

-- Comment the columns for documentation
COMMENT ON COLUMN skills.forked_from IS 'UUID of the parent skill this was forked/customized from';
COMMENT ON COLUMN skills.builder_conversation IS 'JSONB array of chat messages from the Skills Builder AI conversation';
COMMENT ON COLUMN skills.namespace IS 'Namespace for the skill (e.g., @fun for official, null for user skills)';
