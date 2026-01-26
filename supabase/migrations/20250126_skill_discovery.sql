-- Skill Discovery Tables for Trending/Hot Skills Feature
-- These are global tables (not account-bound) for ecosystem-wide skill tracking

-- ============================================
-- Table: skill_sources
-- Defines which GitHub repos/sources to monitor
-- ============================================
CREATE TABLE IF NOT EXISTS skill_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  source_type TEXT CHECK (source_type IN ('official', 'curated', 'popular')) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  sync_interval_hours INTEGER DEFAULT 4,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner, repo)
);

-- Seed initial sources
INSERT INTO skill_sources (owner, repo, source_type) VALUES
  ('anthropics', 'skills', 'official'),
  ('anthropics', 'claude-code-community', 'official'),
  ('travisvn', 'awesome-claude-skills', 'curated'),
  ('ComposioHQ', 'awesome-claude-skills', 'curated'),
  ('VoltAgent', 'awesome-claude-skills', 'curated'),
  ('obra', 'superpowers', 'popular')
ON CONFLICT (owner, repo) DO NOTHING;

-- ============================================
-- Table: skill_discovery
-- Discovered skills from the GitHub ecosystem
-- ============================================
CREATE TABLE IF NOT EXISTS skill_discovery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id BIGINT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,                    -- e.g., "anthropics/skills"
  name TEXT NOT NULL,                         -- repo name
  owner_login TEXT NOT NULL,                  -- GitHub username
  owner_avatar_url TEXT,
  description TEXT,
  html_url TEXT NOT NULL,
  stargazers_count INTEGER DEFAULT 0,
  forks_count INTEGER DEFAULT 0,
  open_issues_count INTEGER DEFAULT 0,
  topics TEXT[],                              -- GitHub topics array
  default_branch TEXT DEFAULT 'main',
  license_name TEXT,
  source_type TEXT CHECK (source_type IN ('official', 'curated', 'community')),
  category TEXT,                              -- Mapped category for filtering
  skill_md_url TEXT,                          -- Raw URL to SKILL.md if found
  skill_md_content TEXT,                      -- Cached SKILL.md content
  ai_summary TEXT,                            -- Claude-generated summary (future)
  ai_summary_updated_at TIMESTAMPTZ,
  github_created_at TIMESTAMPTZ,
  github_updated_at TIMESTAMPTZ,
  github_pushed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_skill_discovery_source_type ON skill_discovery(source_type);
CREATE INDEX IF NOT EXISTS idx_skill_discovery_category ON skill_discovery(category);
CREATE INDEX IF NOT EXISTS idx_skill_discovery_github_updated ON skill_discovery(github_updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_skill_discovery_stargazers ON skill_discovery(stargazers_count DESC);

-- ============================================
-- Table: skill_snapshots
-- Track metrics over time for trend analysis
-- ============================================
CREATE TABLE IF NOT EXISTS skill_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID REFERENCES skill_discovery(id) ON DELETE CASCADE,
  stargazers_count INTEGER,
  forks_count INTEGER,
  hotness_score INTEGER,
  captured_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for time-series queries
CREATE INDEX IF NOT EXISTS idx_snapshots_skill_time ON skill_snapshots(skill_id, captured_at DESC);

-- ============================================
-- View: skill_discovery_with_hotness
-- Computed view with hotness scores
-- ============================================
CREATE OR REPLACE VIEW skill_discovery_with_hotness AS
SELECT
  s.*,
  GREATEST(0, (
    -- Star score (log scale, max ~60 points for 10k stars)
    (LOG(GREATEST(stargazers_count, 1) + 1) * 15)::INTEGER +
    -- Fork score (max ~30 points)
    (LOG(GREATEST(forks_count, 1) + 1) * 10)::INTEGER +
    -- Recency bonus (updated in last 30 days, max 60 points)
    CASE
      WHEN github_updated_at > NOW() - INTERVAL '30 days'
      THEN GREATEST(0, (30 - EXTRACT(DAY FROM NOW() - github_updated_at))::INTEGER * 2)
      ELSE 0
    END +
    -- New repo bonus (created in last 30 days, 30 points)
    CASE
      WHEN github_created_at > NOW() - INTERVAL '30 days' THEN 30
      ELSE 0
    END +
    -- Velocity bonus (stars per day since creation, capped at 50)
    LEAST(50, (
      stargazers_count::NUMERIC /
      GREATEST(1, EXTRACT(DAY FROM NOW() - github_created_at))
    ) * 10)::INTEGER
  )) AS hotness_score,
  -- Computed badges
  github_created_at > NOW() - INTERVAL '14 days' AS is_new,
  github_updated_at > NOW() - INTERVAL '7 days' AS is_recently_updated,
  -- Hot if score > 60
  GREATEST(0, (
    (LOG(GREATEST(stargazers_count, 1) + 1) * 15)::INTEGER +
    (LOG(GREATEST(forks_count, 1) + 1) * 10)::INTEGER +
    CASE WHEN github_updated_at > NOW() - INTERVAL '30 days'
      THEN GREATEST(0, (30 - EXTRACT(DAY FROM NOW() - github_updated_at))::INTEGER * 2)
      ELSE 0 END +
    CASE WHEN github_created_at > NOW() - INTERVAL '30 days' THEN 30 ELSE 0 END +
    LEAST(50, (stargazers_count::NUMERIC / GREATEST(1, EXTRACT(DAY FROM NOW() - github_created_at))) * 10)::INTEGER
  )) > 60 AS is_hot
FROM skill_discovery s;

-- ============================================
-- RLS Policies
-- Discovery tables are read-only for all authenticated users
-- Write operations only via service role (Edge Functions)
-- ============================================

-- skill_sources: Admin only (no public RLS, use service role)
ALTER TABLE skill_sources ENABLE ROW LEVEL SECURITY;

-- skill_discovery: Read-only for all authenticated users
ALTER TABLE skill_discovery ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read discovered skills"
  ON skill_discovery FOR SELECT
  TO authenticated
  USING (true);

-- skill_snapshots: Read-only for all authenticated users
ALTER TABLE skill_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read skill snapshots"
  ON skill_snapshots FOR SELECT
  TO authenticated
  USING (true);

-- ============================================
-- Function: map_topics_to_category
-- Maps GitHub topics to our skill categories
-- ============================================
CREATE OR REPLACE FUNCTION map_topics_to_category(topics TEXT[])
RETURNS TEXT AS $$
DECLARE
  topic TEXT;
BEGIN
  FOREACH topic IN ARRAY COALESCE(topics, ARRAY[]::TEXT[])
  LOOP
    -- Check for category matches
    IF topic ILIKE '%develop%' OR topic ILIKE '%code%' OR topic ILIKE '%programming%' THEN
      RETURN 'development';
    ELSIF topic ILIKE '%write%' OR topic ILIKE '%document%' OR topic ILIKE '%content%' THEN
      RETURN 'writing';
    ELSIF topic ILIKE '%analy%' OR topic ILIKE '%data%' OR topic ILIKE '%research%' THEN
      RETURN 'analysis';
    ELSIF topic ILIKE '%product%' OR topic ILIKE '%workflow%' OR topic ILIKE '%automat%' THEN
      RETURN 'productivity';
    ELSIF topic ILIKE '%design%' OR topic ILIKE '%ui%' OR topic ILIKE '%ux%' THEN
      RETURN 'design';
    ELSIF topic ILIKE '%devops%' OR topic ILIKE '%deploy%' OR topic ILIKE '%ci%' OR topic ILIKE '%cd%' THEN
      RETURN 'devops';
    ELSIF topic ILIKE '%secur%' OR topic ILIKE '%auth%' OR topic ILIKE '%crypto%' THEN
      RETURN 'security';
    ELSIF topic ILIKE '%test%' OR topic ILIKE '%qa%' OR topic ILIKE '%quality%' THEN
      RETURN 'testing';
    ELSIF topic ILIKE '%integrat%' OR topic ILIKE '%api%' OR topic ILIKE '%connect%' THEN
      RETURN 'integration';
    ELSIF topic ILIKE '%commun%' OR topic ILIKE '%chat%' OR topic ILIKE '%message%' THEN
      RETURN 'communication';
    END IF;
  END LOOP;

  RETURN 'other';
END;
$$ LANGUAGE plpgsql IMMUTABLE;
