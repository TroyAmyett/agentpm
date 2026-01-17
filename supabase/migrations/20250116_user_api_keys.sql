-- User API Keys Migration
-- Allows users to store their own LLM provider API keys (encrypted)
-- Date: 2025-01-16

-- =============================================================================
-- USER API KEYS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_api_keys (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,

  -- Provider info
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic', 'google', 'azure', 'cohere', 'mistral', 'groq', 'together', 'replicate', 'custom')),
  provider_name TEXT, -- Custom display name

  -- Encrypted key data
  encrypted_key TEXT NOT NULL, -- AES-256-GCM encrypted
  key_hint TEXT NOT NULL, -- First 4 and last 4 chars for identification (e.g., "sk-...abc1")
  encryption_iv TEXT NOT NULL, -- Initialization vector for decryption

  -- Validation & usage
  is_valid BOOLEAN DEFAULT true,
  last_validated_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  usage_count INTEGER DEFAULT 0,

  -- Scope/permissions
  scopes TEXT[] DEFAULT '{}', -- Which tools can use this key

  -- Rate limiting
  rate_limit_per_minute INTEGER,
  rate_limit_per_hour INTEGER,
  current_minute_usage INTEGER DEFAULT 0,
  current_hour_usage INTEGER DEFAULT 0,
  rate_limit_reset_at TIMESTAMPTZ,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Soft delete
  deleted_at TIMESTAMPTZ,

  -- Constraints
  UNIQUE(user_id, provider, deleted_at)
);

-- Indexes
CREATE INDEX idx_user_api_keys_user_id ON user_api_keys(user_id);
CREATE INDEX idx_user_api_keys_provider ON user_api_keys(provider);
CREATE INDEX idx_user_api_keys_account_id ON user_api_keys(account_id);
CREATE INDEX idx_user_api_keys_deleted_at ON user_api_keys(deleted_at);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_user_api_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_api_keys_updated_at
  BEFORE UPDATE ON user_api_keys
  FOR EACH ROW EXECUTE FUNCTION update_user_api_keys_updated_at();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;

-- Users can only see their own keys
CREATE POLICY "Users can view own api keys"
  ON user_api_keys FOR SELECT
  USING (auth.uid() = user_id AND deleted_at IS NULL);

-- Users can insert their own keys
CREATE POLICY "Users can insert own api keys"
  ON user_api_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own keys
CREATE POLICY "Users can update own api keys"
  ON user_api_keys FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete (soft) their own keys
CREATE POLICY "Users can delete own api keys"
  ON user_api_keys FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to increment usage count
CREATE OR REPLACE FUNCTION increment_api_key_usage(key_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE user_api_keys
  SET
    usage_count = usage_count + 1,
    last_used_at = NOW(),
    current_minute_usage = CASE
      WHEN rate_limit_reset_at IS NULL OR rate_limit_reset_at < NOW() - INTERVAL '1 minute'
      THEN 1
      ELSE current_minute_usage + 1
    END,
    current_hour_usage = CASE
      WHEN rate_limit_reset_at IS NULL OR rate_limit_reset_at < NOW() - INTERVAL '1 hour'
      THEN 1
      ELSE current_hour_usage + 1
    END,
    rate_limit_reset_at = CASE
      WHEN rate_limit_reset_at IS NULL OR rate_limit_reset_at < NOW() - INTERVAL '1 minute'
      THEN NOW()
      ELSE rate_limit_reset_at
    END
  WHERE id = key_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check rate limit
CREATE OR REPLACE FUNCTION check_api_key_rate_limit(key_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  key_record user_api_keys%ROWTYPE;
BEGIN
  SELECT * INTO key_record FROM user_api_keys WHERE id = key_id;

  IF key_record.rate_limit_per_minute IS NOT NULL AND
     key_record.current_minute_usage >= key_record.rate_limit_per_minute THEN
    RETURN FALSE;
  END IF;

  IF key_record.rate_limit_per_hour IS NOT NULL AND
     key_record.current_hour_usage >= key_record.rate_limit_per_hour THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark key as invalid
CREATE OR REPLACE FUNCTION invalidate_api_key(key_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE user_api_keys
  SET is_valid = FALSE, updated_at = NOW()
  WHERE id = key_id AND user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
