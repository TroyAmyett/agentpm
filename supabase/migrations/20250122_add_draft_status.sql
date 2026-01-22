-- Add draft status to tasks for Inbox workflow
-- Tasks now start in draft (Inbox) and move to pending (Ready) to trigger auto-routing

-- Drop existing constraint and add new one with draft
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('draft', 'pending', 'queued', 'in_progress', 'review', 'completed', 'failed', 'cancelled'));

-- Change default status to draft
ALTER TABLE tasks ALTER COLUMN status SET DEFAULT 'draft';

-- Update any tasks currently in pending without an agent to draft (they're inbox items)
UPDATE tasks
SET status = 'draft'
WHERE status = 'pending'
  AND (assigned_to IS NULL OR assigned_to_type != 'agent');

COMMENT ON COLUMN tasks.status IS 'Task workflow status: draft (Inbox), pending (Ready for routing), queued (Assigned, waiting), in_progress, review, completed, failed, cancelled';
