// Workflow Engine — Core orchestration for operational workflows
// Handles: starting runs, advancing steps, gate responses, document outputs

import { supabase } from '@/services/supabase/client'
import { useTaskStore } from '@/stores/taskStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import { useNotesStore } from '@/stores/notesStore'
import type {
  WorkflowTemplate,
  WorkflowRun,
  WorkflowStepDef,
  WorkflowStepResult,
  WorkflowGateResponse,
  WorkflowGateConfig,
  Task,
} from '@/types/agentpm'

// ─── Snake/Camel helpers ────────────────────────────────────────────────────

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

function toCamelCaseKeys<T>(obj: Record<string, unknown>): T {
  const result: Record<string, unknown> = {}
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[toCamelCase(key)] = obj[key]
    }
  }
  return result as T
}

// ─── Start a Workflow Run ───────────────────────────────────────────────────

/**
 * Start a new workflow run from a template.
 * Creates a parent task + workflow_run record + first step subtask.
 */
export async function startWorkflowRun(
  templateId: string,
  accountId: string,
  userId: string,
  triggeredBy: 'user' | 'schedule' | 'agent' = 'user',
): Promise<WorkflowRun | null> {
  if (!supabase) return null

  // Fetch the template
  const { data: templateRow, error: templateErr } = await supabase
    .from('workflow_templates')
    .select('*')
    .eq('id', templateId)
    .single()

  if (templateErr || !templateRow) {
    console.error('[WorkflowEngine] Template not found:', templateErr)
    return null
  }

  const template = toCamelCaseKeys<WorkflowTemplate>(templateRow)
  if (!template.steps || template.steps.length === 0) {
    console.error('[WorkflowEngine] Template has no steps')
    return null
  }

  const taskStore = useTaskStore.getState()
  const today = new Date().toISOString().split('T')[0]

  try {
    // 1. Create parent task
    const parentTask = await taskStore.createTask({
      title: `${template.name} — ${today}`,
      description: template.description || `Workflow run: ${template.name}`,
      priority: 'medium',
      status: 'in_progress',
      projectId: template.projectId,
      accountId,
      input: { workflowRunId: '' }, // placeholder, updated after run creation
      createdBy: userId,
      createdByType: 'user',
      updatedBy: userId,
      updatedByType: 'user',
    })

    if (!parentTask) {
      console.error('[WorkflowEngine] Failed to create parent task')
      return null
    }

    // 2. Create workflow run record
    const { data: runRow, error: runErr } = await supabase
      .from('workflow_runs')
      .insert({
        account_id: accountId,
        template_id: templateId,
        status: 'running',
        current_step_index: 0,
        parent_task_id: parentTask.id,
        steps_snapshot: template.steps,
        step_results: {},
        triggered_by: triggeredBy,
        triggered_by_id: userId,
      })
      .select()
      .single()

    if (runErr || !runRow) {
      console.error('[WorkflowEngine] Failed to create run:', runErr)
      return null
    }

    const run = toCamelCaseKeys<WorkflowRun>(runRow)

    // 3. Update parent task with the actual run ID
    await taskStore.updateTask(parentTask.id, {
      input: { workflowRunId: run.id },
    })

    // 4. Create the first step's subtask
    const firstStep = template.steps[0]
    await createStepTask(run, firstStep, 0, parentTask, accountId, userId)

    console.log(`[WorkflowEngine] Started run ${run.id} for "${template.name}" (${template.steps.length} steps)`)

    // Update store
    useWorkflowStore.getState().updateRunLocally(run.id, run)

    return run
  } catch (err) {
    console.error('[WorkflowEngine] startWorkflowRun error:', err)
    return null
  }
}

// ─── Advance Workflow ───────────────────────────────────────────────────────

/**
 * Advance the workflow after a step completes.
 * Called from the subtask chaining interval when a workflow step task completes.
 */
export async function advanceWorkflow(
  runId: string,
  completedStepId: string,
  stepOutput?: Record<string, unknown>,
): Promise<void> {
  if (!supabase) return

  // Fetch current run state
  const { data: runRow, error: runErr } = await supabase
    .from('workflow_runs')
    .select('*')
    .eq('id', runId)
    .single()

  if (runErr || !runRow) {
    console.error('[WorkflowEngine] Run not found:', runErr)
    return
  }

  const run = toCamelCaseKeys<WorkflowRun>(runRow)
  if (run.status !== 'running') {
    console.log(`[WorkflowEngine] Run ${runId} is ${run.status}, skipping advance`)
    return
  }

  const steps = run.stepsSnapshot
  const stepResults = { ...run.stepResults }

  // Find the completed step index
  const completedIndex = steps.findIndex((s) => s.id === completedStepId)
  if (completedIndex < 0) {
    console.error(`[WorkflowEngine] Step ${completedStepId} not found in run`)
    return
  }

  // Record step result
  stepResults[completedStepId] = {
    ...(stepResults[completedStepId] || {}),
    output: stepOutput,
    status: 'completed',
    completedAt: new Date().toISOString(),
  }

  const nextIndex = completedIndex + 1

  // Handle document_output steps (process immediately, then continue)
  let effectiveNextIndex = nextIndex
  while (effectiveNextIndex < steps.length && steps[effectiveNextIndex].type === 'document_output') {
    const docStep = steps[effectiveNextIndex]
    const docId = await processDocumentOutput(run, docStep, stepResults)

    stepResults[docStep.id] = {
      status: 'completed',
      documentId: docId || undefined,
      completedAt: new Date().toISOString(),
    }

    console.log(`[WorkflowEngine] Document output step "${docStep.title}" processed`)
    effectiveNextIndex++
  }

  // Check if workflow is complete
  if (effectiveNextIndex >= steps.length) {
    // All steps done — mark run completed
    await supabase
      .from('workflow_runs')
      .update({
        status: 'completed',
        current_step_index: steps.length,
        step_results: stepResults,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', runId)

    // Mark parent task completed
    if (run.parentTaskId) {
      const taskStore = useTaskStore.getState()
      await taskStore.updateTaskStatus(run.parentTaskId, 'completed', 'Workflow completed — all steps finished')
    }

    console.log(`[WorkflowEngine] Run ${runId} completed (all ${steps.length} steps done)`)
    useWorkflowStore.getState().updateRunLocally(runId, { status: 'completed', stepResults })
    return
  }

  // Create next step's subtask
  const nextStep = steps[effectiveNextIndex]
  const parentTask = run.parentTaskId
    ? useTaskStore.getState().getTask(run.parentTaskId)
    : null

  if (parentTask) {
    const resolvedInput = resolveInputMapping(nextStep.inputMapping || {}, stepResults)
    const taskId = await createStepTask(
      { ...run, stepResults, currentStepIndex: effectiveNextIndex },
      nextStep,
      effectiveNextIndex,
      parentTask,
      run.accountId,
      run.triggeredById || 'system',
      resolvedInput,
    )

    if (taskId) {
      stepResults[nextStep.id] = {
        status: nextStep.type === 'human_gate' ? 'waiting_gate' : 'running',
        taskId,
        startedAt: new Date().toISOString(),
      }
    }
  }

  // Update run state
  await supabase
    .from('workflow_runs')
    .update({
      current_step_index: effectiveNextIndex,
      step_results: stepResults,
      updated_at: new Date().toISOString(),
    })
    .eq('id', runId)

  useWorkflowStore.getState().updateRunLocally(runId, {
    currentStepIndex: effectiveNextIndex,
    stepResults,
  })

  console.log(`[WorkflowEngine] Advanced run ${runId} to step ${effectiveNextIndex + 1}/${steps.length}: "${nextStep.title}"`)
}

// ─── Handle Human Gate Response ─────────────────────────────────────────────

/**
 * Handle a human gate response (approve, select, input).
 * Updates the step task to completed and advances the workflow.
 */
export async function handleGateResponse(
  runId: string,
  stepId: string,
  taskId: string,
  response: WorkflowGateResponse,
): Promise<void> {
  if (!supabase) return

  // Fetch run
  const { data: runRow } = await supabase
    .from('workflow_runs')
    .select('*')
    .eq('id', runId)
    .single()

  if (!runRow) return
  const run = toCamelCaseKeys<WorkflowRun>(runRow)

  // Update step result with gate response
  const stepResults = { ...run.stepResults }
  stepResults[stepId] = {
    ...(stepResults[stepId] || {}),
    gateResponse: response,
    status: 'completed',
    completedAt: new Date().toISOString(),
  }

  // Save to DB
  await supabase
    .from('workflow_runs')
    .update({
      step_results: stepResults,
      updated_at: new Date().toISOString(),
    })
    .eq('id', runId)

  // Mark the gate task as completed
  const taskStore = useTaskStore.getState()
  await taskStore.updateTaskStatus(taskId, 'completed', `Gate response: ${response.action}`)

  // Store gate response in task output for the chaining interval to pick up
  await taskStore.updateTask(taskId, {
    output: {
      gateResponse: response,
    },
  })

  // Advance the workflow
  await advanceWorkflow(runId, stepId, { gateResponse: response })
}

// ─── Create Step Task ───────────────────────────────────────────────────────

/**
 * Create a subtask for a workflow step under the parent task.
 */
async function createStepTask(
  run: WorkflowRun,
  step: WorkflowStepDef,
  stepIndex: number,
  parentTask: Task,
  accountId: string,
  userId: string,
  resolvedInput?: Record<string, unknown>,
): Promise<string | null> {
  const taskStore = useTaskStore.getState()

  // Build task input
  const taskInput: Record<string, unknown> = {
    workflowRunId: run.id,
    workflowStepIndex: stepIndex,
    ...resolvedInput,
  }

  // For agent tasks, include the prompt
  if (step.type === 'agent_task' && step.prompt) {
    taskInput.prompt = step.prompt
  }

  // For human gates, include gate config
  if (step.type === 'human_gate') {
    const gateConfig: WorkflowGateConfig = {
      type: step.gateType || 'approve',
      prompt: step.gatePrompt || step.description,
      options: step.gateOptions,
    }
    taskInput.workflowGate = gateConfig
  }

  try {
    const task = await taskStore.createTask({
      title: step.title,
      description: `${step.description}\n\n---\nStep ${stepIndex + 1} of ${run.stepsSnapshot.length} | Workflow run`,
      priority: 'medium',
      status: step.type === 'human_gate' ? 'review' : 'queued',
      projectId: parentTask.projectId,
      parentTaskId: parentTask.id,
      accountId,
      workflowRunId: run.id,
      workflowStepId: step.id,
      assignedTo: step.agentId || undefined,
      assignedToType: step.agentId ? 'agent' : undefined,
      skillId: step.skillId || undefined,
      input: taskInput,
      createdBy: userId,
      createdByType: 'user',
      updatedBy: userId,
      updatedByType: 'user',
    })

    if (task) {
      console.log(`[WorkflowEngine] Created step task "${step.title}" (${step.type}) → ${task.id}`)
      return task.id
    }
    return null
  } catch (err) {
    console.error('[WorkflowEngine] createStepTask error:', err)
    return null
  }
}

// ─── Input Mapping Resolution ───────────────────────────────────────────────

/**
 * Resolve input mapping references to actual data from previous step results.
 * Format: { paramName: 'step:{stepId}:{dotPath}' }
 * Example: { "selectedTitles": "step:abc-123:gateResponse.selectedOptions" }
 */
function resolveInputMapping(
  mapping: Record<string, string>,
  stepResults: Record<string, WorkflowStepResult>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {}

  for (const [paramName, reference] of Object.entries(mapping)) {
    if (!reference.startsWith('step:')) {
      resolved[paramName] = reference // literal value
      continue
    }

    const parts = reference.split(':')
    if (parts.length < 3) continue

    const stepId = parts[1]
    const dotPath = parts.slice(2).join(':')
    const stepResult = stepResults[stepId]

    if (!stepResult) {
      console.warn(`[WorkflowEngine] Input mapping: step ${stepId} not found in results`)
      continue
    }

    // Navigate the dot path through the step result
    resolved[paramName] = getNestedValue(stepResult, dotPath)
  }

  return resolved
}

/**
 * Get a nested value from an object using dot notation.
 * e.g., getNestedValue(obj, 'gateResponse.selectedOptions')
 */
function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj

  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }

  return current
}

// ─── Document Output Processing ────────────────────────────────────────────

/**
 * Process a document_output step — creates or updates a Note.
 */
async function processDocumentOutput(
  run: WorkflowRun,
  step: WorkflowStepDef,
  stepResults: Record<string, WorkflowStepResult>,
): Promise<string | null> {
  const notesStore = useNotesStore.getState()

  // Get content from the previous step's output
  const previousStepIndex = run.stepsSnapshot.findIndex((s) => s.id === step.id) - 1
  if (previousStepIndex < 0) return null

  const previousStep = run.stepsSnapshot[previousStepIndex]
  const previousResult = stepResults[previousStep.id]
  if (!previousResult?.output) return null

  // Build document content from step output
  const content = previousResult.output.content || previousResult.output.result || previousResult.output.formatted
  const title = step.documentTitle || `${run.stepsSnapshot[0]?.title || 'Workflow'} — ${new Date().toISOString().split('T')[0]}`

  try {
    const note = await notesStore.addNote({
      title,
      content: typeof content === 'string'
        ? { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: content }] }] }
        : null,
      folder_id: step.documentFolderId || null,
      entity_type: 'workflow',
      entity_id: run.id,
    })

    console.log(`[WorkflowEngine] Created document "${title}" → ${note.id}`)
    return note.id
  } catch (err) {
    console.error('[WorkflowEngine] processDocumentOutput error:', err)
    return null
  }
}

// ─── Handle Failed Step ─────────────────────────────────────────────────────

/**
 * Handle a failed workflow step — marks the run as failed.
 */
export async function handleStepFailure(
  runId: string,
  stepId: string,
  error: string,
): Promise<void> {
  if (!supabase) return

  const { data: runRow } = await supabase
    .from('workflow_runs')
    .select('*')
    .eq('id', runId)
    .single()

  if (!runRow) return
  const run = toCamelCaseKeys<WorkflowRun>(runRow)

  const stepResults = { ...run.stepResults }
  stepResults[stepId] = {
    ...(stepResults[stepId] || {}),
    status: 'failed',
    completedAt: new Date().toISOString(),
  }

  await supabase
    .from('workflow_runs')
    .update({
      status: 'failed',
      step_results: stepResults,
      updated_at: new Date().toISOString(),
    })
    .eq('id', runId)

  // Mark parent task as failed
  if (run.parentTaskId) {
    const taskStore = useTaskStore.getState()
    const failedStep = run.stepsSnapshot.find((s) => s.id === stepId)
    await taskStore.updateTaskStatus(
      run.parentTaskId,
      'failed',
      `Workflow failed at step "${failedStep?.title || stepId}": ${error}`,
    )
  }

  useWorkflowStore.getState().updateRunLocally(runId, { status: 'failed', stepResults })
  console.error(`[WorkflowEngine] Run ${runId} failed at step ${stepId}: ${error}`)
}
