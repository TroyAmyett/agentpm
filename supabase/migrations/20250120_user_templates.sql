-- =============================================================================
-- USER TEMPLATES MIGRATION
-- Allows users to create and save their own note templates
-- Date: 2025-01-20
-- =============================================================================

-- =============================================================================
-- USER_TEMPLATES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Template metadata
  name VARCHAR(255) NOT NULL,
  description TEXT,
  icon VARCHAR(50) DEFAULT 'file-text',
  category VARCHAR(100),

  -- Template content (Tiptap JSONContent format)
  content JSONB NOT NULL,

  -- Flags
  is_favorite BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_user_templates_user_id ON user_templates(user_id);
CREATE INDEX idx_user_templates_category ON user_templates(category);
CREATE INDEX idx_user_templates_is_favorite ON user_templates(is_favorite);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_user_templates_updated_at ON user_templates;
CREATE TRIGGER update_user_templates_updated_at
  BEFORE UPDATE ON user_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE user_templates ENABLE ROW LEVEL SECURITY;

-- Users can only view their own templates
CREATE POLICY "Users can view own templates"
  ON user_templates FOR SELECT
  USING (user_id = auth.uid());

-- Users can insert their own templates
CREATE POLICY "Users can insert own templates"
  ON user_templates FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can update their own templates
CREATE POLICY "Users can update own templates"
  ON user_templates FOR UPDATE
  USING (user_id = auth.uid());

-- Users can delete their own templates
CREATE POLICY "Users can delete own templates"
  ON user_templates FOR DELETE
  USING (user_id = auth.uid());

-- Service role has full access
CREATE POLICY "Service role full access to user_templates"
  ON user_templates FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
