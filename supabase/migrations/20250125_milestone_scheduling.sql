-- Add scheduling fields to milestones table
-- Enables Task Lists to be scheduled for one-time or recurring execution

-- Add schedule column (JSONB to store schedule configuration)
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS schedule JSONB;

-- Add scheduling metadata columns
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ;
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ;
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS is_schedule_active BOOLEAN DEFAULT false;

-- Create index for finding milestones that need to be executed
CREATE INDEX IF NOT EXISTS idx_milestones_next_run
ON milestones (next_run_at)
WHERE is_schedule_active = true AND next_run_at IS NOT NULL;

-- Comment on columns for documentation
COMMENT ON COLUMN milestones.schedule IS 'Schedule configuration: {type, hour, dayOfWeek, dayOfMonth, runDate, endDate}';
COMMENT ON COLUMN milestones.next_run_at IS 'Next scheduled execution time';
COMMENT ON COLUMN milestones.last_run_at IS 'Last time this schedule was executed';
COMMENT ON COLUMN milestones.is_schedule_active IS 'Whether the schedule is currently active';
