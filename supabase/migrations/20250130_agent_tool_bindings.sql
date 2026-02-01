-- Agent Tool Bindings Migration
-- Adds a tools column to agent_personas so each agent type only gets relevant tools

-- Add tools column (TEXT array, defaults to empty = all tools for backward compat)
ALTER TABLE agent_personas ADD COLUMN IF NOT EXISTS tools TEXT[] DEFAULT '{}';

-- Populate defaults for existing agents based on their agent_type
UPDATE agent_personas
SET tools = CASE agent_type
  WHEN 'content-writer' THEN ARRAY['web_search', 'fetch_url', 'publish_blog_post', 'generate_image', 'create_landing_page']
  WHEN 'image-generator' THEN ARRAY['generate_image']
  WHEN 'researcher' THEN ARRAY['web_search', 'fetch_url', 'dns_lookup', 'check_domain_availability']
  WHEN 'qa-tester' THEN ARRAY['web_search', 'fetch_url']
  WHEN 'forge' THEN ARRAY['web_search', 'fetch_url']
  WHEN 'orchestrator' THEN ARRAY[]::TEXT[]
  ELSE '{}'::TEXT[]
END
WHERE tools = '{}' OR tools IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN agent_personas.tools IS 'Tool names this agent can use. Empty array = all tools (backward compat).';
