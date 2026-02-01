-- Phase 5: Skill-Tool Binding
-- Skills declare which tools they need and which LLM providers they work with

ALTER TABLE skills ADD COLUMN IF NOT EXISTS required_tools TEXT[] DEFAULT '{}';
ALTER TABLE skills ADD COLUMN IF NOT EXISTS compatible_providers TEXT[] DEFAULT '{universal}';
ALTER TABLE skills ADD COLUMN IF NOT EXISTS input_schema JSONB;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS output_schema JSONB;
