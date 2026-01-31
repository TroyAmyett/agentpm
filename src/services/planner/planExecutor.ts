// Plan Executor - Coordinates plan execution based on confidence mode
// Creates subtasks using the existing parentTaskId pattern.
// Supports auto, plan-then-execute, and step-by-step modes.

import type { Task } from '@/types/agentpm'
import { supabase } from '@/services/supabase/client'
import type { ExecutionPlan, PlanStep } from './dynamicPlanner'

// ─── Types ───────────────────────────────────────────────────────────────────

export type PlanExecutionMode = 'auto' | 'plan-then-execute' | 'step-by-step'

// ─── Create Subtasks from Plan ───────────────────────────────────────────────

/**
 * Create subtasks for a plan under the parent task.
 * Called in auto mode (all at once) or step-by-step (one at a time).
 *
 * @param steps - Plan steps to create as subtasks
 * @param parentTask - The parent task
 * @param accountId - Account ID
 * @param userId - User who triggered this
 * @param createTask - Function to create tasks (from taskStore)
 * @param createDependency - Function to create task dependencies
 * @returns Array of created subtask IDs
 */
export async function createSubtasksFromPlan(
  steps: PlanStep[],
  parentTask: Task,
  accountId: string,
  userId: string,
  createTask: (data: Record<string, unknown>) => Promise<Task | null>,
  createDependency: (taskId: string, dependsOnId: string, accountId: string, userId: string) => Promise<unknown>,
): Promise<string[]> {
  const createdIds: string[] = []

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    const hasDependency = step.dependsOnIndex != null && step.dependsOnIndex >= 0

    const subTaskData: Record<string, unknown> = {
      title: step.title,
      description: `${step.description}\n\n---\nPart of: ${parentTask.title}`,
      priority: parentTask.priority,
      projectId: parentTask.projectId,
      parentTaskId: parentTask.id,
      accountId,
      // First task (or task with no deps) goes to queued, others wait
      status: (i === 0 || !hasDependency) ? 'queued' : 'pending',
      assignedTo: step.agentId,
      assignedToType: 'agent',
      createdBy: userId,
      createdByType: 'user',
      updatedBy: userId,
      updatedByType: 'user',
    }

    const subTask = await createTask(subTaskData)
    if (subTask) {
      createdIds.push(subTask.id)
      console.log(`[PlanExecutor] Created step ${i + 1}/${steps.length}: "${step.title}" → ${step.agentAlias}`)

      // Create dependency if this step depends on a previous one
      if (hasDependency && step.dependsOnIndex! < createdIds.length) {
        const dependsOnTaskId = createdIds[step.dependsOnIndex!]
        try {
          await createDependency(subTask.id, dependsOnTaskId, accountId, userId)
          console.log(`[PlanExecutor] Dependency: "${step.title}" depends on step ${step.dependsOnIndex! + 1}`)
        } catch (err) {
          console.error('[PlanExecutor] Failed to create dependency:', err)
        }
      }
    }
  }

  return createdIds
}

// ─── Step-by-Step: Create Next Step ──────────────────────────────────────────

/**
 * Create the next subtask in a step-by-step plan.
 * Called when the user approves the next step.
 *
 * @param plan - The full execution plan
 * @param stepIndex - Which step to create (0-based)
 * @param parentTask - The parent task
 * @param accountId - Account ID
 * @param userId - User who approved
 * @param createTask - Task creation function
 * @returns The created subtask ID, or null if no more steps
 */
export async function createNextStep(
  plan: ExecutionPlan,
  stepIndex: number,
  parentTask: Task,
  accountId: string,
  userId: string,
  createTask: (data: Record<string, unknown>) => Promise<Task | null>,
): Promise<string | null> {
  if (stepIndex >= plan.steps.length) return null

  const step = plan.steps[stepIndex]

  const subTaskData: Record<string, unknown> = {
    title: step.title,
    description: `${step.description}\n\n---\nStep ${stepIndex + 1} of ${plan.steps.length} | Part of: ${parentTask.title}`,
    priority: parentTask.priority,
    projectId: parentTask.projectId,
    parentTaskId: parentTask.id,
    accountId,
    status: 'queued',
    assignedTo: step.agentId,
    assignedToType: 'agent',
    createdBy: userId,
    createdByType: 'user',
    updatedBy: userId,
    updatedByType: 'user',
  }

  const subTask = await createTask(subTaskData)
  if (subTask) {
    console.log(`[PlanExecutor] Step-by-step: created step ${stepIndex + 1}/${plan.steps.length}: "${step.title}"`)
    return subTask.id
  }

  return null
}

// ─── Plan Storage ────────────────────────────────────────────────────────────

/**
 * Store a plan on the parent task's input field.
 * Used for plan-then-execute and step-by-step modes.
 */
export async function storePlanOnTask(
  taskId: string,
  plan: ExecutionPlan,
): Promise<void> {
  if (!supabase) return

  // Read current task input
  const { data: task } = await supabase
    .from('tasks')
    .select('input')
    .eq('id', taskId)
    .single()

  const currentInput = (task?.input || {}) as Record<string, unknown>

  await supabase
    .from('tasks')
    .update({
      input: {
        ...currentInput,
        plan: {
          steps: plan.steps,
          confidence: plan.confidence,
          executionMode: plan.executionMode,
          patternKey: plan.patternKey,
          reasoning: plan.reasoning,
        },
        planPatternKey: plan.patternKey,
        planCurrentStep: 0,
      },
    })
    .eq('id', taskId)
}

/**
 * Get the stored plan from a task's input field.
 */
export function getPlanFromTask(task: Task): ExecutionPlan | null {
  const input = task.input as Record<string, unknown> | undefined
  if (!input?.plan) return null
  return input.plan as ExecutionPlan
}

/**
 * Get the current step index for a step-by-step plan.
 */
export function getPlanCurrentStep(task: Task): number {
  const input = task.input as Record<string, unknown> | undefined
  return (input?.planCurrentStep as number) || 0
}

/**
 * Advance the current step index for a step-by-step plan.
 */
export async function advancePlanStep(taskId: string): Promise<void> {
  if (!supabase) return

  const { data: task } = await supabase
    .from('tasks')
    .select('input')
    .eq('id', taskId)
    .single()

  const currentInput = (task?.input || {}) as Record<string, unknown>
  const currentStep = (currentInput.planCurrentStep as number) || 0

  await supabase
    .from('tasks')
    .update({
      input: {
        ...currentInput,
        planCurrentStep: currentStep + 1,
      },
    })
    .eq('id', taskId)
}
