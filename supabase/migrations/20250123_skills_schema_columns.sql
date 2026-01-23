-- =============================================================================
-- SKILLS TABLE SCHEMA COLUMNS
-- Date: 2025-01-23
-- Purpose: Add input/output schema and requirements columns to skills table
-- =============================================================================

-- Add input schema column (parsed from SKILL.md frontmatter)
ALTER TABLE skills ADD COLUMN IF NOT EXISTS input_schema JSONB DEFAULT '[]';
/*
  Example:
  [
    { "name": "topic", "type": "string", "required": true, "description": "What to write about" },
    { "name": "length", "type": "enum", "options": ["short", "medium", "long"], "default": "medium" },
    { "name": "tone", "type": "enum", "options": ["professional", "casual", "technical"], "default": "professional" }
  ]
*/

-- Add output schema column (parsed from SKILL.md frontmatter)
ALTER TABLE skills ADD COLUMN IF NOT EXISTS output_schema JSONB DEFAULT '[]';
/*
  Example:
  [
    { "name": "title", "type": "string", "required": true },
    { "name": "content", "type": "string", "required": true, "format": "markdown" },
    { "name": "meta_description", "type": "string", "required": true, "max_length": 160 },
    { "name": "tags", "type": "array", "items": "string" }
  ]
*/

-- Add requirements column (for provider routing)
ALTER TABLE skills ADD COLUMN IF NOT EXISTS requirements JSONB DEFAULT '{}';
/*
  Example:
  {
    "min_context_tokens": 100000,  -- Route to Gemini for large context
    "needs_vision": true,          -- Needs image input capability
    "needs_function_calling": true, -- Needs structured output
    "needs_web_access": true,      -- Needs to fetch URLs
    "min_model_tier": "standard"   -- "lite" | "standard" | "advanced"
  }
*/

-- Add forking-related columns
ALTER TABLE skills ADD COLUMN IF NOT EXISTS parent_version VARCHAR(20);
ALTER TABLE skills ADD COLUMN IF NOT EXISTS customization_notes TEXT;

-- =============================================================================
-- COMMENTS for documentation
-- =============================================================================
COMMENT ON COLUMN skills.input_schema IS 'JSON array of input field definitions parsed from SKILL.md frontmatter';
COMMENT ON COLUMN skills.output_schema IS 'JSON array of output field definitions parsed from SKILL.md frontmatter';
COMMENT ON COLUMN skills.requirements IS 'JSON object of skill requirements for provider routing (context size, vision, etc)';
COMMENT ON COLUMN skills.parent_version IS 'Version of parent skill when forked, for update notifications';
COMMENT ON COLUMN skills.customization_notes IS 'User notes about what was customized in a forked skill';

-- =============================================================================
-- INDEX for finding skills by requirements
-- =============================================================================
-- GIN index for querying requirements JSONB
CREATE INDEX IF NOT EXISTS idx_skills_requirements
  ON skills USING GIN (requirements);

-- Note: Expression indexes for specific requirements fields can be added later
-- when there's a clear query pattern to optimize
