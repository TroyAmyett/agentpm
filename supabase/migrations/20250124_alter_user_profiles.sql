-- Alter existing user_profiles table to add missing columns
-- The table already has: id, full_name, avatar_url, timezone, preferences, created_at, updated_at

-- Add user_id column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add language column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'language'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN language TEXT DEFAULT 'en';
  END IF;
END $$;

-- Add currency column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'currency'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN currency TEXT DEFAULT 'USD';
  END IF;
END $$;

-- Add date_format column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'date_format'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN date_format TEXT DEFAULT 'MM/DD/YYYY';
  END IF;
END $$;

-- Add time_format column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'time_format'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN time_format TEXT DEFAULT '12h';
  END IF;
END $$;

-- Make timezone have a default if it doesn't already
ALTER TABLE user_profiles ALTER COLUMN timezone SET DEFAULT 'UTC';

-- Create unique index on user_id if it doesn't exist
CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_user_id_key ON user_profiles(user_id);
