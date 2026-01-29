-- Video Production System
-- Supports AI-powered video generation via HeyGen and other platforms

-- Video job status enum
CREATE TYPE video_job_status AS ENUM (
  'draft',           -- Initial state, configuring
  'analyzing',       -- AI analyzing input content
  'scripting',       -- AI generating script
  'scene_planning',  -- Breaking script into scenes
  'pending',         -- Ready to submit to platform
  'rendering',       -- Submitted, platform is rendering
  'completed',       -- Video ready
  'failed',          -- Error occurred
  'cancelled'        -- User cancelled
);

-- Video type enum (from PRD)
CREATE TYPE video_type AS ENUM (
  'onboarding',      -- 2-5 min: Welcome, Overview, Key Features, Getting Started, CTA
  'feature_demo',    -- 1-3 min: Problem, Solution, Demo, Benefits, CTA
  'how_to',          -- 2-4 min: Objective, Prerequisites, Step-by-Step, Summary
  'quick_tip',       -- 30-60 sec: Hook, Tip, Example, Recap
  'training',        -- Variable: Full training content
  'marketing'        -- Variable: Promotional content
);

-- Video platform enum
CREATE TYPE video_platform AS ENUM (
  'heygen',
  'synthesia',
  'colossyan'
);

-- ============================================
-- VIDEO TEMPLATES
-- Reusable configurations for consistent branding
-- ============================================
CREATE TABLE video_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Template metadata
  name TEXT NOT NULL,
  description TEXT,
  video_type video_type NOT NULL DEFAULT 'onboarding',

  -- Platform settings
  platform video_platform NOT NULL DEFAULT 'heygen',
  platform_template_id TEXT,  -- If using platform's template system

  -- Avatar & Voice
  avatar_id TEXT,             -- Platform's avatar identifier
  avatar_name TEXT,           -- Human-readable name
  voice_id TEXT,              -- Platform's voice identifier
  voice_name TEXT,            -- Human-readable name
  voice_settings JSONB DEFAULT '{
    "accent": "american",
    "pace": "medium",
    "emotion": "warm"
  }'::jsonb,

  -- Visual settings
  background_type TEXT DEFAULT 'solid',  -- solid, gradient, image, video
  background_value TEXT DEFAULT '#0a0a0f',
  logo_position TEXT DEFAULT 'bottom-right',  -- top-left, top-right, bottom-left, bottom-right, none

  -- Brand integration (links to brand_configs if exists)
  brand_config_id UUID,
  brand_overrides JSONB DEFAULT '{}'::jsonb,  -- Override specific brand settings

  -- Default video specs
  resolution TEXT DEFAULT '1920x1080',
  aspect_ratio TEXT DEFAULT '16:9',
  captions_enabled BOOLEAN DEFAULT true,

  -- Template variables (for personalization)
  variables JSONB DEFAULT '[]'::jsonb,  -- Array of {name, description, default}

  -- Intro/Outro sequences
  intro_clip_url TEXT,
  outro_clip_url TEXT,

  -- Status
  is_default BOOLEAN DEFAULT false,
  is_shared BOOLEAN DEFAULT false,  -- Shared with team

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- VIDEO JOBS
-- Individual video generation requests
-- ============================================
CREATE TABLE video_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Job metadata
  title TEXT NOT NULL,
  description TEXT,
  video_type video_type NOT NULL DEFAULT 'onboarding',
  status video_job_status DEFAULT 'draft',

  -- Input content (what to make video about)
  input_type TEXT,  -- 'text', 'url', 'document', 'attachment'
  input_content TEXT,
  input_attachment_id UUID REFERENCES attachments(id) ON DELETE SET NULL,
  input_url TEXT,

  -- AI-analyzed content
  product_info JSONB,  -- {product_name, key_features[], target_audience, use_cases[], terminology[]}

  -- Generated script
  script JSONB,  -- {title, sections[{name, content, duration_sec, on_screen_text}], total_duration}
  script_approved BOOLEAN DEFAULT false,
  script_approved_at TIMESTAMPTZ,
  script_approved_by UUID REFERENCES auth.users(id),

  -- Scene plan
  scenes JSONB,  -- Array of {scene_number, start_time, end_time, script_text, background, avatar_action, on_screen_elements[]}

  -- Platform & Template
  platform video_platform DEFAULT 'heygen',
  template_id UUID REFERENCES video_templates(id) ON DELETE SET NULL,

  -- Platform job tracking
  platform_job_id TEXT,         -- HeyGen's video_id or equivalent
  platform_status TEXT,         -- Raw status from platform
  platform_response JSONB,      -- Full response for debugging

  -- Avatar & Voice (can override template)
  avatar_id TEXT,
  voice_id TEXT,

  -- Output
  video_url TEXT,               -- Final video URL
  video_duration_seconds INTEGER,
  thumbnail_url TEXT,
  captions_url TEXT,            -- SRT or VTT file

  -- Quality & Export
  resolution TEXT DEFAULT '1920x1080',
  format TEXT DEFAULT 'mp4',

  -- Related entities (for context)
  related_task_id UUID,         -- If created from a task
  related_project_id UUID,      -- Project context
  related_note_id UUID,         -- If created from note content

  -- Cost tracking
  estimated_credits INTEGER,
  actual_credits INTEGER,

  -- Error handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  last_retry_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,     -- When sent to platform
  completed_at TIMESTAMPTZ
);

-- ============================================
-- VIDEO SCENES (normalized for complex editing)
-- ============================================
CREATE TABLE video_scenes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES video_jobs(id) ON DELETE CASCADE,

  scene_number INTEGER NOT NULL,

  -- Timing
  start_time_sec NUMERIC(10,2) DEFAULT 0,
  end_time_sec NUMERIC(10,2),
  duration_sec NUMERIC(10,2),

  -- Content
  script_text TEXT NOT NULL,
  on_screen_text TEXT,

  -- Visual settings
  background_type TEXT,
  background_value TEXT,
  avatar_position TEXT DEFAULT 'center',  -- center, left, right, corner, none
  avatar_action TEXT DEFAULT 'talking',   -- talking, gesturing, listening

  -- Screen recording overlay
  screen_recording_url TEXT,
  screen_recording_position TEXT,  -- fullscreen, left, right, pip-corner

  -- Additional elements
  elements JSONB DEFAULT '[]'::jsonb,  -- [{type, content, position, style}]

  -- Order
  sort_order INTEGER NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(job_id, scene_number)
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_video_templates_account ON video_templates(account_id);
CREATE INDEX idx_video_templates_platform ON video_templates(platform);

CREATE INDEX idx_video_jobs_account ON video_jobs(account_id);
CREATE INDEX idx_video_jobs_status ON video_jobs(status);
CREATE INDEX idx_video_jobs_platform ON video_jobs(platform);
CREATE INDEX idx_video_jobs_platform_job ON video_jobs(platform_job_id);
CREATE INDEX idx_video_jobs_created ON video_jobs(created_at DESC);

CREATE INDEX idx_video_scenes_job ON video_scenes(job_id);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE video_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_scenes ENABLE ROW LEVEL SECURITY;

-- Templates: Users can manage templates for their accounts
CREATE POLICY video_templates_select ON video_templates
  FOR SELECT USING (
    account_id IN (
      SELECT account_id FROM user_account_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY video_templates_insert ON video_templates
  FOR INSERT WITH CHECK (
    account_id IN (
      SELECT account_id FROM user_account_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY video_templates_update ON video_templates
  FOR UPDATE USING (
    account_id IN (
      SELECT account_id FROM user_account_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY video_templates_delete ON video_templates
  FOR DELETE USING (
    account_id IN (
      SELECT account_id FROM user_account_members
      WHERE user_id = auth.uid()
    )
  );

-- Jobs: Users can manage jobs for their accounts
CREATE POLICY video_jobs_select ON video_jobs
  FOR SELECT USING (
    account_id IN (
      SELECT account_id FROM user_account_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY video_jobs_insert ON video_jobs
  FOR INSERT WITH CHECK (
    account_id IN (
      SELECT account_id FROM user_account_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY video_jobs_update ON video_jobs
  FOR UPDATE USING (
    account_id IN (
      SELECT account_id FROM user_account_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY video_jobs_delete ON video_jobs
  FOR DELETE USING (
    account_id IN (
      SELECT account_id FROM user_account_members
      WHERE user_id = auth.uid()
    )
  );

-- Scenes: Access through job
CREATE POLICY video_scenes_select ON video_scenes
  FOR SELECT USING (
    job_id IN (
      SELECT id FROM video_jobs WHERE account_id IN (
        SELECT account_id FROM user_account_members
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY video_scenes_insert ON video_scenes
  FOR INSERT WITH CHECK (
    job_id IN (
      SELECT id FROM video_jobs WHERE account_id IN (
        SELECT account_id FROM user_account_members
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY video_scenes_update ON video_scenes
  FOR UPDATE USING (
    job_id IN (
      SELECT id FROM video_jobs WHERE account_id IN (
        SELECT account_id FROM user_account_members
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY video_scenes_delete ON video_scenes
  FOR DELETE USING (
    job_id IN (
      SELECT id FROM video_jobs WHERE account_id IN (
        SELECT account_id FROM user_account_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================
-- TRIGGERS
-- ============================================
CREATE TRIGGER video_templates_updated_at
  BEFORE UPDATE ON video_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER video_jobs_updated_at
  BEFORE UPDATE ON video_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER video_scenes_updated_at
  BEFORE UPDATE ON video_scenes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE video_templates IS 'Reusable video production templates with avatar, voice, and brand settings';
COMMENT ON TABLE video_jobs IS 'Individual video generation jobs tracking full lifecycle from draft to completion';
COMMENT ON TABLE video_scenes IS 'Scene breakdown for video jobs, normalized for complex editing workflows';
