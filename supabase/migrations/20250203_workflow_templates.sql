-- Workflow Templates & Runs — Operational Orchestration
-- Enables reusable multi-step workflows with scheduling, human gates, and document outputs

-- ─── Workflow Templates ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,

  -- Steps: ordered JSONB array of WorkflowStepDef
  steps JSONB NOT NULL DEFAULT '[]',

  -- Scheduling (same MilestoneSchedule format)
  schedule JSONB,
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  is_schedule_active BOOLEAN DEFAULT false,

  -- Optional project scope
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

  -- Audit
  created_by UUID,
  created_by_type TEXT DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- ─── Workflow Runs ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,

  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'paused', 'completed', 'failed', 'cancelled')),
  current_step_index INTEGER DEFAULT 0,

  parent_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,

  -- Accumulated step results: { stepId: { output, gateResponse, documentId, taskId, status } }
  step_results JSONB DEFAULT '{}',

  -- Snapshot of steps at run creation time (template may evolve)
  steps_snapshot JSONB NOT NULL DEFAULT '[]',

  triggered_by TEXT NOT NULL DEFAULT 'user'
    CHECK (triggered_by IN ('user', 'schedule', 'agent')),
  triggered_by_id UUID,

  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_wf_templates_account
  ON workflow_templates(account_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_wf_templates_schedule
  ON workflow_templates(next_run_at)
  WHERE is_schedule_active = true AND next_run_at IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_wf_runs_account ON workflow_runs(account_id);
CREATE INDEX IF NOT EXISTS idx_wf_runs_template ON workflow_runs(template_id);
CREATE INDEX IF NOT EXISTS idx_wf_runs_status ON workflow_runs(status) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS idx_wf_runs_parent_task ON workflow_runs(parent_task_id);

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE workflow_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wf_templates_account_access" ON workflow_templates
  FOR ALL USING (account_id IN (
    SELECT account_id FROM user_accounts WHERE user_id = auth.uid()
  ));

ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wf_runs_account_access" ON workflow_runs
  FOR ALL USING (account_id IN (
    SELECT account_id FROM user_accounts WHERE user_id = auth.uid()
  ));

-- ─── Extend Tasks for Workflow Context ──────────────────────────────────────
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS workflow_run_id UUID;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS workflow_step_id TEXT;

-- Add FK after workflow_runs table exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'tasks_workflow_run_id_fkey'
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT tasks_workflow_run_id_fkey
      FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tasks_workflow_run ON tasks(workflow_run_id)
  WHERE workflow_run_id IS NOT NULL;

-- ─── Scheduled Workflow Processing (pg_cron) ────────────────────────────────
-- Runs alongside existing process_scheduled_milestones()
-- Reuses calculate_next_run() function from 20250125_schedule_cron_job.sql

CREATE OR REPLACE FUNCTION process_scheduled_workflows()
RETURNS void AS $$
DECLARE
  template_rec RECORD;
  new_run_id UUID;
  new_parent_task_id UUID;
  next_run TIMESTAMPTZ;
  first_step JSONB;
BEGIN
  FOR template_rec IN
    SELECT id, account_id, name, description, steps, schedule, project_id, created_by
    FROM workflow_templates
    WHERE is_schedule_active = true
      AND next_run_at IS NOT NULL
      AND next_run_at <= NOW()
      AND deleted_at IS NULL
  LOOP
    new_run_id := gen_random_uuid();
    new_parent_task_id := gen_random_uuid();

    -- Create parent task for this workflow run
    INSERT INTO tasks (
      id, account_id, project_id, title, description,
      priority, status, input,
      created_by, created_by_type, updated_by, updated_by_type
    ) VALUES (
      new_parent_task_id,
      template_rec.account_id,
      template_rec.project_id,
      template_rec.name || ' — ' || TO_CHAR(NOW(), 'YYYY-MM-DD'),
      COALESCE(template_rec.description, 'Scheduled workflow run'),
      'medium',
      'in_progress',
      jsonb_build_object('workflowRunId', new_run_id::TEXT),
      COALESCE(template_rec.created_by::TEXT, 'system'),
      'system',
      'system',
      'system'
    );

    -- Create workflow run record
    INSERT INTO workflow_runs (
      id, account_id, template_id, status, current_step_index,
      parent_task_id, steps_snapshot, triggered_by
    ) VALUES (
      new_run_id,
      template_rec.account_id,
      template_rec.id,
      'running',
      0,
      new_parent_task_id,
      template_rec.steps,
      'schedule'
    );

    -- Create first step's subtask
    first_step := template_rec.steps->0;
    IF first_step IS NOT NULL THEN
      INSERT INTO tasks (
        account_id, project_id, parent_task_id, title, description,
        priority, status, workflow_run_id, workflow_step_id,
        assigned_to, assigned_to_type,
        input,
        created_by, created_by_type, updated_by, updated_by_type
      ) VALUES (
        template_rec.account_id,
        template_rec.project_id,
        new_parent_task_id,
        first_step->>'title',
        COALESCE(first_step->>'description', ''),
        'medium',
        CASE
          WHEN first_step->>'type' = 'human_gate' THEN 'review'
          ELSE 'queued'
        END,
        new_run_id,
        first_step->>'id',
        CASE WHEN first_step->>'agentId' IS NOT NULL
          THEN (first_step->>'agentId')::UUID ELSE NULL END,
        CASE WHEN first_step->>'agentId' IS NOT NULL
          THEN 'agent' ELSE NULL END,
        CASE WHEN first_step->>'type' = 'human_gate' THEN
          jsonb_build_object(
            'workflowGate', jsonb_build_object(
              'type', COALESCE(first_step->>'gateType', 'approve'),
              'prompt', COALESCE(first_step->>'gatePrompt', ''),
              'options', COALESCE(first_step->'gateOptions', '[]'::JSONB)
            )
          )
        WHEN first_step->>'prompt' IS NOT NULL THEN
          jsonb_build_object('prompt', first_step->>'prompt')
        ELSE '{}'::JSONB
        END,
        'system', 'system', 'system', 'system'
      );
    END IF;

    -- Calculate next run time
    next_run := calculate_next_run(template_rec.schedule);

    UPDATE workflow_templates
    SET last_run_at = NOW(),
        next_run_at = next_run,
        is_schedule_active = (next_run IS NOT NULL),
        updated_at = NOW()
    WHERE id = template_rec.id;

    RAISE NOTICE 'Started workflow run % for template "%"', new_run_id, template_rec.name;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Schedule at 5 minutes past each hour (offset from milestone cron at :00)
SELECT cron.schedule(
  'process-scheduled-workflows',
  '5 * * * *',
  'SELECT process_scheduled_workflows()'
);
