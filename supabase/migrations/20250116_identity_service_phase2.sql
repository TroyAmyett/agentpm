-- Identity Service Phase 2 Migration
-- SSO & Tool Registration
-- Date: 2025-01-16

-- =============================================================================
-- TOOL REGISTRATIONS TABLE
-- Registers external tools that can authenticate via OAuth2
-- =============================================================================

CREATE TABLE IF NOT EXISTS tool_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tool info
  name TEXT NOT NULL,
  description TEXT,
  base_url TEXT NOT NULL,
  callback_url TEXT NOT NULL,
  icon_url TEXT,

  -- Requirements
  required_providers TEXT[] DEFAULT '{}',
  scopes TEXT[] DEFAULT '{}',

  -- OAuth credentials
  client_id TEXT UNIQUE NOT NULL,
  client_secret_hash TEXT NOT NULL,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_tool_registrations_client_id ON tool_registrations(client_id);
CREATE INDEX IF NOT EXISTS idx_tool_registrations_is_active ON tool_registrations(is_active);
CREATE INDEX IF NOT EXISTS idx_tool_registrations_name ON tool_registrations(name);

-- =============================================================================
-- OAUTH TOKENS TABLE
-- Stores OAuth tokens for SSO sessions
-- =============================================================================

CREATE TABLE IF NOT EXISTS oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relationships
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_id UUID NOT NULL REFERENCES tool_registrations(id) ON DELETE CASCADE,

  -- Token data (hashed)
  access_token_hash TEXT NOT NULL,
  refresh_token_hash TEXT,

  -- Permissions
  scopes TEXT[] DEFAULT '{}',

  -- Expiration
  expires_at TIMESTAMPTZ NOT NULL,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user_id ON oauth_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_tool_id ON oauth_tokens(tool_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_expires_at ON oauth_tokens(expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_tokens_user_tool ON oauth_tokens(user_id, tool_id);

-- =============================================================================
-- ACCOUNT INVITATIONS TABLE
-- Stores pending member invitations
-- =============================================================================

CREATE TABLE IF NOT EXISTS account_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relationships
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- Invitation details
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'viewer')),

  -- Inviter
  invited_by UUID REFERENCES auth.users(id),

  -- Token for accepting
  token TEXT UNIQUE NOT NULL,

  -- Expiration
  expires_at TIMESTAMPTZ NOT NULL,

  -- Status
  accepted_at TIMESTAMPTZ,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_invitations_account_id ON account_invitations(account_id);
CREATE INDEX IF NOT EXISTS idx_account_invitations_email ON account_invitations(email);
CREATE INDEX IF NOT EXISTS idx_account_invitations_token ON account_invitations(token);
CREATE INDEX IF NOT EXISTS idx_account_invitations_expires_at ON account_invitations(expires_at);

-- =============================================================================
-- OAUTH AUTHORIZATION CODES TABLE
-- Temporary storage for OAuth2 authorization code flow
-- =============================================================================

CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Code
  code TEXT UNIQUE NOT NULL,

  -- Relationships
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_id UUID NOT NULL REFERENCES tool_registrations(id) ON DELETE CASCADE,

  -- OAuth params
  redirect_uri TEXT NOT NULL,
  scopes TEXT[] DEFAULT '{}',
  state TEXT,

  -- Expiration (short-lived, typically 10 minutes)
  expires_at TIMESTAMPTZ NOT NULL,

  -- Usage tracking
  used_at TIMESTAMPTZ,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_auth_codes_code ON oauth_authorization_codes(code);
CREATE INDEX IF NOT EXISTS idx_oauth_auth_codes_expires_at ON oauth_authorization_codes(expires_at);

-- =============================================================================
-- TRIGGERS: Auto-update updated_at
-- =============================================================================

CREATE TRIGGER update_tool_registrations_updated_at
  BEFORE UPDATE ON tool_registrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE tool_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_authorization_codes ENABLE ROW LEVEL SECURITY;

-- Tool Registrations: Only admins can manage, anyone can view active tools
CREATE POLICY "Anyone can view active tools"
  ON tool_registrations FOR SELECT
  USING (is_active = TRUE);

CREATE POLICY "Service role can manage tools"
  ON tool_registrations FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- OAuth Tokens: Users can only see their own tokens
CREATE POLICY "Users can view own oauth tokens"
  ON oauth_tokens FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own oauth tokens"
  ON oauth_tokens FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own oauth tokens"
  ON oauth_tokens FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "Service role full access to oauth_tokens"
  ON oauth_tokens FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Account Invitations: Users can see invitations for accounts they're admin of
CREATE POLICY "Users can view invitations for their accounts"
  ON account_invitations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_accounts ua
      WHERE ua.user_id = auth.uid()
        AND ua.account_id = account_invitations.account_id
        AND ua.role IN ('owner', 'admin')
    )
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

CREATE POLICY "Admins can create invitations"
  ON account_invitations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_accounts ua
      WHERE ua.user_id = auth.uid()
        AND ua.account_id = account_invitations.account_id
        AND ua.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admins can delete invitations"
  ON account_invitations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_accounts ua
      WHERE ua.user_id = auth.uid()
        AND ua.account_id = account_invitations.account_id
        AND ua.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Service role full access to account_invitations"
  ON account_invitations FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- OAuth Authorization Codes: Only service role (handled by API)
CREATE POLICY "Service role full access to oauth_auth_codes"
  ON oauth_authorization_codes FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to check if a user has a role in an account
CREATE OR REPLACE FUNCTION user_has_account_role(
  p_user_id UUID,
  p_account_id UUID,
  p_min_role TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
  role_order TEXT[] := ARRAY['viewer', 'member', 'admin', 'owner'];
BEGIN
  SELECT role INTO user_role
  FROM user_accounts
  WHERE user_id = p_user_id AND account_id = p_account_id;

  IF user_role IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN array_position(role_order, user_role) >= array_position(role_order, p_min_role);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to generate a secure random token
CREATE OR REPLACE FUNCTION generate_secure_token(length INTEGER DEFAULT 32)
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..length LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to hash tokens (for OAuth)
CREATE OR REPLACE FUNCTION hash_token(token TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN encode(sha256(token::bytea), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =============================================================================
-- CLEANUP FUNCTIONS
-- =============================================================================

-- Function to cleanup expired OAuth tokens
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_tokens()
RETURNS void AS $$
BEGIN
  DELETE FROM oauth_tokens WHERE expires_at < NOW();
  DELETE FROM oauth_authorization_codes WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup expired invitations
CREATE OR REPLACE FUNCTION cleanup_expired_invitations()
RETURNS void AS $$
BEGIN
  DELETE FROM account_invitations
  WHERE expires_at < NOW() AND accepted_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
