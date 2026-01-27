-- Brand & Templates Feature
-- Enables accounts to configure brand identity and generate branded documents

-- ============================================================================
-- TABLES
-- ============================================================================

-- Account Brand Configuration
-- Stores brand settings (logo, colors, company info) per account
CREATE TABLE IF NOT EXISTS account_brand_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- Brand configuration stored as JSONB for flexibility
  -- Schema: { companyName, tagline, docNumberPrefix, logos: { primary, secondary, favicon },
  --           colors: { primary, secondary, accent, background, text },
  --           fonts: { heading, body }, extractedFromUrl, extractedAt }
  brand_config JSONB NOT NULL DEFAULT '{
    "companyName": "",
    "tagline": "",
    "docNumberPrefix": "",
    "logos": {
      "primary": null,
      "secondary": null,
      "favicon": null
    },
    "colors": {
      "primary": "#0ea5e9",
      "secondary": "#64748b",
      "accent": "#f59e0b",
      "background": "#ffffff",
      "text": "#0f172a"
    },
    "fonts": {
      "heading": "Inter",
      "body": "Inter"
    }
  }'::jsonb,

  -- Setup workflow state
  setup_completed BOOLEAN NOT NULL DEFAULT FALSE,
  setup_completed_at TIMESTAMPTZ,

  -- Audit columns
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID NOT NULL,

  -- Each account can only have one brand config
  CONSTRAINT account_brand_config_account_unique UNIQUE(account_id)
);

-- Account Document Templates
-- Stores generated template files (docx, pptx, xlsx)
CREATE TABLE IF NOT EXISTS account_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- Template metadata
  template_type TEXT NOT NULL CHECK (template_type IN ('document', 'presentation', 'spreadsheet')),
  template_name TEXT NOT NULL,
  description TEXT,

  -- Storage reference (brands/{account_id}/templates/{filename})
  storage_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT NOT NULL,

  -- Status flags
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  -- Audit columns
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID NOT NULL,
  deleted_at TIMESTAMPTZ
);

-- Document Sequences
-- Tracks document numbering per account, document type, and optionally year
CREATE TABLE IF NOT EXISTS document_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- Sequence key components
  document_type TEXT NOT NULL CHECK (document_type IN ('PRD', 'SOW', 'RPT', 'PRP', 'PRS', 'SHT', 'DOC')),
  year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM NOW())::INTEGER,

  -- Current sequence value
  last_number INTEGER NOT NULL DEFAULT 0,

  -- Timestamp for debugging
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One sequence per account/type/year combination
  CONSTRAINT document_sequences_unique UNIQUE(account_id, document_type, year)
);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Atomic increment function for document numbering
-- Returns the next document number for the given account and type
CREATE OR REPLACE FUNCTION get_next_document_number(
  p_account_id UUID,
  p_document_type TEXT,
  p_year INTEGER DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_year INTEGER;
  v_next_number INTEGER;
BEGIN
  -- Use current year if not specified
  v_year := COALESCE(p_year, EXTRACT(YEAR FROM NOW())::INTEGER);

  -- Insert or update sequence atomically
  INSERT INTO document_sequences (account_id, document_type, year, last_number)
  VALUES (p_account_id, p_document_type, v_year, 1)
  ON CONFLICT (account_id, document_type, year)
  DO UPDATE SET
    last_number = document_sequences.last_number + 1,
    updated_at = NOW()
  RETURNING last_number INTO v_next_number;

  RETURN v_next_number;
END;
$$;

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_brand_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update timestamp on brand config changes
DROP TRIGGER IF EXISTS update_account_brand_config_timestamp ON account_brand_config;
CREATE TRIGGER update_account_brand_config_timestamp
  BEFORE UPDATE ON account_brand_config
  FOR EACH ROW
  EXECUTE FUNCTION update_brand_config_timestamp();

DROP TRIGGER IF EXISTS update_account_templates_timestamp ON account_templates;
CREATE TRIGGER update_account_templates_timestamp
  BEFORE UPDATE ON account_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_brand_config_timestamp();

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_account_brand_config_account ON account_brand_config(account_id);
CREATE INDEX IF NOT EXISTS idx_account_templates_account ON account_templates(account_id);
CREATE INDEX IF NOT EXISTS idx_account_templates_type ON account_templates(account_id, template_type);
CREATE INDEX IF NOT EXISTS idx_account_templates_active ON account_templates(account_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_document_sequences_lookup ON document_sequences(account_id, document_type, year);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE account_brand_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_sequences ENABLE ROW LEVEL SECURITY;

-- Brand Config Policies
CREATE POLICY "Users can view brand config for their account"
  ON account_brand_config FOR SELECT
  USING (account_id = get_user_account_id());

CREATE POLICY "Users can insert brand config for their account"
  ON account_brand_config FOR INSERT
  WITH CHECK (account_id = get_user_account_id());

CREATE POLICY "Users can update brand config for their account"
  ON account_brand_config FOR UPDATE
  USING (account_id = get_user_account_id());

CREATE POLICY "Users can delete brand config for their account"
  ON account_brand_config FOR DELETE
  USING (account_id = get_user_account_id());

-- Template Policies
CREATE POLICY "Users can view templates for their account"
  ON account_templates FOR SELECT
  USING (account_id = get_user_account_id() AND deleted_at IS NULL);

CREATE POLICY "Users can insert templates for their account"
  ON account_templates FOR INSERT
  WITH CHECK (account_id = get_user_account_id());

CREATE POLICY "Users can update templates for their account"
  ON account_templates FOR UPDATE
  USING (account_id = get_user_account_id());

CREATE POLICY "Users can delete templates for their account"
  ON account_templates FOR DELETE
  USING (account_id = get_user_account_id());

-- Document Sequences Policies
CREATE POLICY "Users can view sequences for their account"
  ON document_sequences FOR SELECT
  USING (account_id = get_user_account_id());

CREATE POLICY "Users can insert sequences for their account"
  ON document_sequences FOR INSERT
  WITH CHECK (account_id = get_user_account_id());

CREATE POLICY "Users can update sequences for their account"
  ON document_sequences FOR UPDATE
  USING (account_id = get_user_account_id());

-- Service Role Policies (for Edge Functions)
CREATE POLICY "Service role full access to brand_config"
  ON account_brand_config FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to templates"
  ON account_templates FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to sequences"
  ON document_sequences FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- STORAGE BUCKET
-- ============================================================================

-- Create brands bucket for logos, templates, and generated documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'brands',
  'brands',
  true,  -- Public for logos; templates use signed URLs
  52428800,  -- 50MB limit
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/svg+xml',
    'image/webp',
    'image/gif',
    'image/x-icon',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage Policies for brands bucket
-- Users can view their account's brand assets
CREATE POLICY "Users can view brand assets for their account"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'brands' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM accounts
    WHERE id IN (SELECT account_id FROM user_accounts WHERE user_id = auth.uid())
  )
);

-- Users can upload brand assets to their account folder
CREATE POLICY "Users can upload brand assets for their account"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'brands' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM accounts
    WHERE id IN (SELECT account_id FROM user_accounts WHERE user_id = auth.uid())
  )
);

-- Users can update their account's brand assets
CREATE POLICY "Users can update brand assets for their account"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'brands' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM accounts
    WHERE id IN (SELECT account_id FROM user_accounts WHERE user_id = auth.uid())
  )
);

-- Users can delete their account's brand assets
CREATE POLICY "Users can delete brand assets for their account"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'brands' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM accounts
    WHERE id IN (SELECT account_id FROM user_accounts WHERE user_id = auth.uid())
  )
);

-- Service role full access to brands bucket
CREATE POLICY "Service role full access to brands bucket"
ON storage.objects FOR ALL
USING (
  bucket_id = 'brands' AND
  auth.jwt() ->> 'role' = 'service_role'
);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE account_brand_config IS 'Stores brand identity configuration (logo, colors, company info) per account';
COMMENT ON TABLE account_templates IS 'Stores generated document templates (docx, pptx, xlsx) per account';
COMMENT ON TABLE document_sequences IS 'Tracks document numbering sequences per account and document type';
COMMENT ON FUNCTION get_next_document_number IS 'Atomically increments and returns the next document number for an account/type';
