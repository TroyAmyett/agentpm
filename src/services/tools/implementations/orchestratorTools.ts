// Orchestrator Tool Implementations
// create_task, list_tasks, get_task_result, assign_task, update_task_status, preview_plan, cancel_tree, estimate_cost

import type { ToolResult } from '../types'
import type { OrchestratorPlan, OrchestratorPlanStep, TaskPriority } from '@/types/agentpm'
import { supabase } from '@/services/supabase/client'

// ============================================================================
// CREATE TASK
// ============================================================================

interface CreateTaskParams {
  title: string
  description?: string
  priority?: TaskPriority
  assign_to_agent_type: string
  assign_to_agent_id?: string
  depends_on_task_ids?: string[]
  skill_slug?: string
  accountId: string
  _contextTaskId: string  // The orchestrator's own task (becomes parent)
  _agentId?: string       // The orchestrator agent ID
}

export async function createTaskTool(params: CreateTaskParams): Promise<ToolResult> {
  if (!supabase) {
    return { success: false, error: 'Database not configured' }
  }

  try {
    // Enforce hard limit: count existing children of this parent
    const { count: childCount } = await supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('parent_task_id', params._contextTaskId)
      .neq('status', 'cancelled')
      .is('deleted_at', null)

    // Fetch orchestrator config for hard limits
    const { data: orchConfig } = await supabase
      .from('orchestrator_config')
      .select('max_subtasks_per_parent')
      .eq('account_id', params.accountId)
      .single()

    const maxSubtasks = orchConfig?.max_subtasks_per_parent ?? 10
    if ((childCount ?? 0) >= maxSubtasks) {
      return {
        success: false,
        error: `Cannot create subtask: reached maximum of ${maxSubtasks} subtasks per parent. Cancel existing subtasks or increase the limit.`,
      }
    }

    // Resolve agent: by ID or by type
    let agentId = params.assign_to_agent_id
    let agentAlias = params.assign_to_agent_type

    if (!agentId) {
      const { data: agents } = await supabase
        .from('agent_personas')
        .select('id, alias')
        .eq('account_id', params.accountId)
        .eq('agent_type', params.assign_to_agent_type)
        .eq('is_active', true)
        .is('deleted_at', null)
        .is('paused_at', null)
        .limit(1)

      if (!agents || agents.length === 0) {
        return {
          success: false,
          error: `No active agent of type "${params.assign_to_agent_type}" found. Available agent types: content-writer, researcher, qa-tester, image-generator, forge.`,
        }
      }

      agentId = agents[0].id
      agentAlias = agents[0].alias || params.assign_to_agent_type
    }

    // Resolve skill by slug if provided
    let skillId: string | null = null
    if (params.skill_slug) {
      const { data: skill } = await supabase
        .from('skills')
        .select('id')
        .eq('account_id', params.accountId)
        .eq('slug', params.skill_slug)
        .eq('is_enabled', true)
        .is('deleted_at', null)
        .single()

      if (skill) {
        skillId = skill.id
      }
    }

    const now = new Date().toISOString()

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        account_id: params.accountId,
        title: params.title,
        description: params.description || null,
        priority: params.priority || 'medium',
        status: 'queued',
        parent_task_id: params._contextTaskId,
        assigned_to: agentId,
        assigned_to_type: 'agent',
        skill_id: skillId,
        depends_on: params.depends_on_task_ids || [],
        created_at: now,
        created_by: params._agentId || null,
        created_by_type: 'agent',
        updated_at: now,
        updated_by: params._agentId || null,
        updated_by_type: 'agent',
        auto_generated: true,
        source_task_id: params._contextTaskId,
        status_history: [
          {
            status: 'queued',
            changedAt: now,
            changedBy: params._agentId || 'orchestrator',
            changedByType: 'agent',
            note: 'Created by orchestrator',
          },
        ],
      })
      .select('id, title, status, assigned_to')
      .single()

    if (error) {
      return { success: false, error: `Failed to create subtask: ${error.message}` }
    }

    return {
      success: true,
      data: {
        formatted: `Subtask created: "${data.title}" (ID: ${data.id}) → assigned to ${agentAlias} (${agentId}), status: queued`,
        taskId: data.id,
        title: data.title,
        assignedTo: agentId,
        assignedToAlias: agentAlias,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: `Failed to create subtask: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

// ============================================================================
// LIST TASKS
// ============================================================================

interface ListTasksParams {
  parent_task_id?: string
  status?: string
  assigned_to?: string
  limit?: number
  accountId: string
  _contextTaskId: string
}

export async function listTasksTool(params: ListTasksParams): Promise<ToolResult> {
  if (!supabase) {
    return { success: false, error: 'Database not configured' }
  }

  try {
    const parentId = params.parent_task_id || params._contextTaskId
    const limit = params.limit || 20

    let query = supabase
      .from('tasks')
      .select('id, title, status, priority, assigned_to, assigned_to_type, depends_on, completed_at, created_at')
      .eq('account_id', params.accountId)
      .eq('parent_task_id', parentId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(limit)

    if (params.status) {
      query = query.eq('status', params.status)
    }
    if (params.assigned_to) {
      query = query.eq('assigned_to', params.assigned_to)
    }

    const { data, error } = await query

    if (error) {
      return { success: false, error: `Failed to list tasks: ${error.message}` }
    }

    const tasks = data || []
    const formatted = tasks.length === 0
      ? 'No tasks found matching criteria.'
      : tasks.map((t, i) =>
          `${i + 1}. [${t.status.toUpperCase()}] "${t.title}" (ID: ${t.id}) — priority: ${t.priority}, assigned: ${t.assigned_to || 'unassigned'}${t.depends_on?.length ? `, depends on: ${t.depends_on.join(', ')}` : ''}`
        ).join('\n')

    return {
      success: true,
      data: {
        formatted,
        tasks,
        count: tasks.length,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: `Failed to list tasks: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

// ============================================================================
// GET TASK RESULT
// ============================================================================

interface GetTaskResultParams {
  task_id: string
  accountId: string
}

export async function getTaskResultTool(params: GetTaskResultParams): Promise<ToolResult> {
  if (!supabase) {
    return { success: false, error: 'Database not configured' }
  }

  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('id, title, status, output, error, completed_at')
      .eq('id', params.task_id)
      .eq('account_id', params.accountId)
      .is('deleted_at', null)
      .single()

    if (error || !data) {
      return { success: false, error: `Task not found: ${error?.message || 'No data'}` }
    }

    const output = data.output as Record<string, unknown> | null
    const taskError = data.error as Record<string, unknown> | null

    let formatted = `Task "${data.title}" — Status: ${data.status}\n`
    if (data.status === 'completed' && output) {
      const content = (output.content as string) || (output.summary as string) || JSON.stringify(output)
      formatted += `Result:\n${content}`
    } else if (data.status === 'failed' && taskError) {
      formatted += `Error: ${(taskError.message as string) || JSON.stringify(taskError)}`
    } else {
      formatted += `Task is still ${data.status}. No output yet.`
    }

    return {
      success: true,
      data: {
        formatted,
        taskId: data.id,
        status: data.status,
        output: data.output,
        error: data.error,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: `Failed to get task result: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

// ============================================================================
// ASSIGN TASK
// ============================================================================

interface AssignTaskParams {
  task_id: string
  agent_id: string
  accountId: string
  _agentId?: string
}

export async function assignTaskTool(params: AssignTaskParams): Promise<ToolResult> {
  if (!supabase) {
    return { success: false, error: 'Database not configured' }
  }

  try {
    // Verify target agent exists and is active
    const { data: agent } = await supabase
      .from('agent_personas')
      .select('id, alias, agent_type, is_active')
      .eq('id', params.agent_id)
      .eq('account_id', params.accountId)
      .single()

    if (!agent) {
      return { success: false, error: `Agent ${params.agent_id} not found` }
    }
    if (!agent.is_active) {
      return { success: false, error: `Agent "${agent.alias}" is not active` }
    }

    const now = new Date().toISOString()

    const { error } = await supabase
      .from('tasks')
      .update({
        assigned_to: params.agent_id,
        assigned_to_type: 'agent',
        status: 'queued',
        updated_at: now,
        updated_by: params._agentId || null,
        updated_by_type: 'agent',
      })
      .eq('id', params.task_id)
      .eq('account_id', params.accountId)

    if (error) {
      return { success: false, error: `Failed to assign task: ${error.message}` }
    }

    return {
      success: true,
      data: {
        formatted: `Task ${params.task_id} assigned to ${agent.alias || agent.agent_type} (${agent.id}), status set to queued.`,
        taskId: params.task_id,
        agentId: agent.id,
        agentAlias: agent.alias,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: `Failed to assign task: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

// ============================================================================
// UPDATE TASK STATUS
// ============================================================================

interface UpdateTaskStatusParams {
  task_id: string
  status: string
  output?: Record<string, unknown>
  accountId: string
  _agentId?: string
}

export async function updateTaskStatusTool(params: UpdateTaskStatusParams): Promise<ToolResult> {
  if (!supabase) {
    return { success: false, error: 'Database not configured' }
  }

  const validStatuses = ['queued', 'in_progress', 'review', 'completed', 'failed', 'cancelled']
  if (!validStatuses.includes(params.status)) {
    return { success: false, error: `Invalid status "${params.status}". Valid: ${validStatuses.join(', ')}` }
  }

  try {
    const now = new Date().toISOString()

    // Fetch current task to append status history
    const { data: currentTask } = await supabase
      .from('tasks')
      .select('status, status_history, output')
      .eq('id', params.task_id)
      .eq('account_id', params.accountId)
      .single()

    if (!currentTask) {
      return { success: false, error: `Task ${params.task_id} not found` }
    }

    const statusHistory = Array.isArray(currentTask.status_history) ? currentTask.status_history : []
    statusHistory.push({
      status: params.status,
      changedAt: now,
      changedBy: params._agentId || 'orchestrator',
      changedByType: 'agent',
    })

    const updates: Record<string, unknown> = {
      status: params.status,
      status_history: statusHistory,
      updated_at: now,
      updated_by: params._agentId || null,
      updated_by_type: 'agent',
    }

    if (params.status === 'completed') {
      updates.completed_at = now
    }

    if (params.output) {
      // Merge with existing output
      const existingOutput = (currentTask.output as Record<string, unknown>) || {}
      updates.output = { ...existingOutput, ...params.output }
    }

    const { error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', params.task_id)
      .eq('account_id', params.accountId)

    if (error) {
      return { success: false, error: `Failed to update task status: ${error.message}` }
    }

    return {
      success: true,
      data: {
        formatted: `Task ${params.task_id} status updated to "${params.status}".${params.output ? ' Output attached.' : ''}`,
        taskId: params.task_id,
        status: params.status,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: `Failed to update task status: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

// ============================================================================
// PREVIEW PLAN (Dry Run)
// ============================================================================

interface PreviewPlanParams {
  summary: string
  subtasks: Array<{
    title: string
    description?: string
    assign_to_agent_type: string
    priority?: string
    depends_on_steps?: number[]
    skill_slug?: string
  }>
  reasoning: string
  accountId: string
  _contextTaskId: string
  _agentId?: string
}

export async function previewPlanTool(params: PreviewPlanParams): Promise<ToolResult> {
  if (!supabase) {
    return { success: false, error: 'Database not configured' }
  }

  try {
    // Build the plan object
    const plan: OrchestratorPlan = {
      summary: params.summary,
      subtasks: params.subtasks.map((s): OrchestratorPlanStep => ({
        title: s.title,
        description: s.description || '',
        assignToAgentType: s.assign_to_agent_type,
        priority: (s.priority || 'medium') as TaskPriority,
        dependsOnSteps: s.depends_on_steps,
        skillSlug: s.skill_slug,
      })),
      reasoning: params.reasoning,
    }

    const now = new Date().toISOString()

    // Fetch current task output to merge
    const { data: currentTask } = await supabase
      .from('tasks')
      .select('output, status_history')
      .eq('id', params._contextTaskId)
      .eq('account_id', params.accountId)
      .single()

    const existingOutput = (currentTask?.output as Record<string, unknown>) || {}
    const statusHistory = Array.isArray(currentTask?.status_history) ? currentTask.status_history : []
    statusHistory.push({
      status: 'review',
      changedAt: now,
      changedBy: params._agentId || 'orchestrator',
      changedByType: 'agent',
      note: 'Orchestrator plan awaiting approval',
    })

    // Write plan to task output and set to review
    const { error } = await supabase
      .from('tasks')
      .update({
        output: { ...existingOutput, plan },
        status: 'review',
        status_history: statusHistory,
        updated_at: now,
        updated_by: params._agentId || null,
        updated_by_type: 'agent',
      })
      .eq('id', params._contextTaskId)
      .eq('account_id', params.accountId)

    if (error) {
      return { success: false, error: `Failed to save plan: ${error.message}` }
    }

    // Format plan summary for the LLM response
    const planLines = plan.subtasks.map((s, i) => {
      const deps = s.dependsOnSteps?.length
        ? ` (after step ${s.dependsOnSteps.map(d => d + 1).join(', ')})`
        : ''
      return `  ${i + 1}. [${s.assignToAgentType}] ${s.title}${deps}`
    })

    const formatted = [
      `Plan submitted for human approval.`,
      ``,
      `Summary: ${plan.summary}`,
      ``,
      `Subtasks:`,
      ...planLines,
      ``,
      `Reasoning: ${plan.reasoning}`,
      ``,
      `The task is now in "review" status. Execution will proceed when the human approves the plan.`,
    ].join('\n')

    return {
      success: true,
      data: {
        formatted,
        plan,
        taskId: params._contextTaskId,
        status: 'review',
      },
    }
  } catch (err) {
    return {
      success: false,
      error: `Failed to preview plan: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

// ============================================================================
// CANCEL TREE
// ============================================================================

interface CancelTreeParams {
  task_id: string
  accountId: string
  _agentId?: string
}

export async function cancelTreeTool(params: CancelTreeParams): Promise<ToolResult> {
  if (!supabase) {
    return { success: false, error: 'Database not configured' }
  }

  try {
    // Verify the task belongs to this account
    const { data: task } = await supabase
      .from('tasks')
      .select('id, title, account_id')
      .eq('id', params.task_id)
      .eq('account_id', params.accountId)
      .single()

    if (!task) {
      return { success: false, error: `Task ${params.task_id} not found` }
    }

    // Call the Postgres function
    const { data, error } = await supabase
      .rpc('cancel_task_tree', {
        root_id: params.task_id,
        cancelled_by: params._agentId || null,
        cancelled_by_type: 'agent',
      })

    if (error) {
      return { success: false, error: `Failed to cancel tree: ${error.message}` }
    }

    const cancelled = data as number

    return {
      success: true,
      data: {
        formatted: `Task tree cancelled. ${cancelled} task(s) set to "cancelled" status (root: "${task.title}").`,
        taskId: params.task_id,
        cancelledCount: cancelled,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: `Failed to cancel tree: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

// ============================================================================
// ESTIMATE COST
// ============================================================================

interface EstimateCostStep {
  agent_type: string
  estimated_tokens?: number
  model?: string
}

interface EstimateCostParams {
  steps: EstimateCostStep[]
  accountId: string
}

// Approximate cost per 1K tokens (input + output blended) in cents
const MODEL_COST_PER_1K_TOKENS: Record<string, number> = {
  haiku:  0.1,    // $0.001/1K tokens
  sonnet: 1.5,    // $0.015/1K tokens
  opus:   7.5,    // $0.075/1K tokens
}

// Default token estimates by agent type when not specified
const DEFAULT_TOKENS_BY_AGENT_TYPE: Record<string, number> = {
  'content-writer': 4000,
  'researcher': 3000,
  'image-generator': 1000,
  'qa-tester': 2000,
  'orchestrator': 2000,
  'forge': 5000,
}

const DEFAULT_MODEL = 'sonnet'
const DEFAULT_TOKENS = 2500

export async function estimateCostTool(params: EstimateCostParams): Promise<ToolResult> {
  try {
    const stepEstimates = params.steps.map((step, i) => {
      const model = step.model || DEFAULT_MODEL
      const tokens = step.estimated_tokens
        || DEFAULT_TOKENS_BY_AGENT_TYPE[step.agent_type]
        || DEFAULT_TOKENS
      const costPer1K = MODEL_COST_PER_1K_TOKENS[model] || MODEL_COST_PER_1K_TOKENS[DEFAULT_MODEL]
      const costCents = Math.round((tokens / 1000) * costPer1K * 100) / 100

      return {
        step: i + 1,
        agentType: step.agent_type,
        model,
        estimatedTokens: tokens,
        estimatedCostCents: costCents,
      }
    })

    const totalCostCents = stepEstimates.reduce((sum, s) => sum + s.estimatedCostCents, 0)
    const totalTokens = stepEstimates.reduce((sum, s) => sum + s.estimatedTokens, 0)

    const formatted = [
      `Estimated cost: $${(totalCostCents / 100).toFixed(2)} (${totalTokens.toLocaleString()} tokens)`,
      '',
      ...stepEstimates.map(s =>
        `  Step ${s.step}: ${s.agentType} (${s.model}) — ~${s.estimatedTokens.toLocaleString()} tokens — $${(s.estimatedCostCents / 100).toFixed(4)}`
      ),
    ].join('\n')

    return {
      success: true,
      data: {
        formatted,
        totalCostCents: Math.round(totalCostCents * 100) / 100,
        totalTokens,
        steps: stepEstimates,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: `Failed to estimate cost: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}
