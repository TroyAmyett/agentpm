-- Add website field to user_profiles
-- Allows storing user's company website for brand extraction and reuse

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'website') THEN
    ALTER TABLE user_profiles ADD COLUMN website TEXT;
  END IF;
END $$;

COMMENT ON COLUMN user_profiles.website IS 'User company website URL for brand extraction';
