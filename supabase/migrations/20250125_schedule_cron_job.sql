-- Set up pg_cron job to process scheduled Task Lists
-- This runs every hour on the hour
-- Clones tasks directly in Postgres - no Edge Function needed

-- Function to calculate next run time based on schedule
CREATE OR REPLACE FUNCTION calculate_next_run(schedule JSONB)
RETURNS TIMESTAMPTZ AS $$
DECLARE
  schedule_type TEXT;
  schedule_hour INTEGER;
  day_of_week INTEGER;
  day_of_month INTEGER;
  end_date DATE;
  next_run TIMESTAMPTZ;
BEGIN
  schedule_type := schedule->>'type';
  schedule_hour := COALESCE((schedule->>'hour')::INTEGER, 0);

  IF schedule_type = 'once' THEN
    -- One-time schedules don't repeat
    RETURN NULL;
  END IF;

  IF schedule_type = 'daily' THEN
    next_run := DATE_TRUNC('day', NOW()) + INTERVAL '1 day' + (schedule_hour || ' hours')::INTERVAL;
  ELSIF schedule_type = 'weekly' THEN
    day_of_week := COALESCE((schedule->>'dayOfWeek')::INTEGER, 0);
    -- Find next occurrence of this day
    next_run := DATE_TRUNC('day', NOW()) + ((day_of_week - EXTRACT(DOW FROM NOW())::INTEGER + 7) % 7 +
                CASE WHEN EXTRACT(DOW FROM NOW())::INTEGER = day_of_week AND NOW()::TIME > (schedule_hour || ':00')::TIME THEN 7 ELSE 0 END) * INTERVAL '1 day'
                + (schedule_hour || ' hours')::INTERVAL;
  ELSIF schedule_type = 'monthly' THEN
    day_of_month := COALESCE((schedule->>'dayOfMonth')::INTEGER, 1);
    next_run := DATE_TRUNC('month', NOW()) + INTERVAL '1 month' + ((day_of_month - 1) || ' days')::INTERVAL + (schedule_hour || ' hours')::INTERVAL;
    IF next_run <= NOW() THEN
      next_run := next_run + INTERVAL '1 month';
    END IF;
  ELSE
    RETURN NULL;
  END IF;

  -- Check end date
  IF schedule->>'endDate' IS NOT NULL THEN
    end_date := (schedule->>'endDate')::DATE;
    IF next_run::DATE > end_date THEN
      RETURN NULL;
    END IF;
  END IF;

  RETURN next_run;
END;
$$ LANGUAGE plpgsql;

-- Main function to process scheduled milestones
CREATE OR REPLACE FUNCTION process_scheduled_milestones()
RETURNS void AS $$
DECLARE
  milestone_rec RECORD;
  task_rec RECORD;
  next_run TIMESTAMPTZ;
  tasks_cloned INTEGER;
BEGIN
  -- Find milestones that are due to run
  FOR milestone_rec IN
    SELECT id, account_id, project_id, name, schedule
    FROM milestones
    WHERE is_schedule_active = true
      AND next_run_at IS NOT NULL
      AND next_run_at <= NOW()
      AND deleted_at IS NULL
  LOOP
    tasks_cloned := 0;

    -- Clone all tasks from this milestone
    FOR task_rec IN
      SELECT account_id, project_id, milestone_id, title, description, priority, skill_id, sort_order
      FROM tasks
      WHERE milestone_id = milestone_rec.id
        AND deleted_at IS NULL
      ORDER BY sort_order
    LOOP
      INSERT INTO tasks (
        account_id, project_id, milestone_id, title, description,
        priority, skill_id, sort_order, status,
        created_by, created_by_type, updated_by, updated_by_type
      ) VALUES (
        task_rec.account_id, task_rec.project_id, task_rec.milestone_id,
        task_rec.title, task_rec.description, task_rec.priority,
        task_rec.skill_id, task_rec.sort_order, 'pending',
        'system', 'system', 'system', 'system'
      );
      tasks_cloned := tasks_cloned + 1;
    END LOOP;

    -- Calculate next run time
    next_run := calculate_next_run(milestone_rec.schedule);

    -- Update milestone
    UPDATE milestones
    SET last_run_at = NOW(),
        next_run_at = next_run,
        is_schedule_active = (next_run IS NOT NULL),
        updated_at = NOW()
    WHERE id = milestone_rec.id;

    RAISE NOTICE 'Processed milestone %, cloned % tasks, next run: %',
      milestone_rec.name, tasks_cloned, next_run;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Create the cron job
-- Runs at minute 0 of every hour
SELECT cron.schedule(
  'process-scheduled-milestones',
  '0 * * * *',
  'SELECT process_scheduled_milestones()'
);

-- To view scheduled jobs:
-- SELECT * FROM cron.job;

-- To view job run history:
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;

-- To unschedule:
-- SELECT cron.unschedule('process-scheduled-milestones');
