// Execution Store - Manages task execution state

import { create } from 'zustand'
import { supabase } from '@/services/supabase/client'
import type { Task, AgentPersona, Skill } from '@/types/agentpm'
import { executeTask, type ExecutionResult, type ExecutionStatusCallback } from '@/services/agents/executor'
import { parseAgentOutput } from '@/services/agents/outputParser'
import { uploadAgentOutputFiles, type Attachment } from '@/services/attachments/attachmentService'
import { processExecutionOutcome } from '@/services/trust/annealingLoop'
import { reserveSlot, releaseSlot, configFromPersona } from '@/services/agents/agentQueue'
import { useTaskStore } from './taskStore'

export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'awaiting_approval'

export interface TaskExecution {
  id: string
  taskId: string
  agentId: string
  accountId: string
  skillId?: string
  status: ExecutionStatus
  inputPrompt?: string
  inputContext?: {
    taskTitle: string
    taskDescription?: string
    agentAlias: string
    skillName?: string
  }
  outputContent?: string
  outputMetadata?: {
    model: string
    inputTokens: number
    outputTokens: number
    durationMs: number
    toolsUsed?: Array<{
      name: string
      input: Record<string, unknown>
      success: boolean
      error?: string
    }>
    toolIterations?: number
  }
  errorMessage?: string
  errorDetails?: Record<string, unknown>
  requiresApproval: boolean
  approvalReason?: string
  approvedBy?: string
  approvedAt?: string
  startedAt?: string
  completedAt?: string
  createdAt: string
  triggeredBy: string
  triggeredByType: 'user' | 'agent' | 'schedule'
  // Attachments generated from agent output
  attachments?: Attachment[]
}

interface ExecutionState {
  executions: TaskExecution[]
  currentExecution: TaskExecution | null
  activeExecutions: Map<string, TaskExecution> // taskId -> execution for parallel
  isLoading: boolean
  isExecuting: boolean // true if ANY task is executing
  executionStatus: 'idle' | 'building_prompt' | 'calling_api' | 'processing'
  error: string | null

  // Actions
  fetchExecutions: (accountId: string, taskId?: string) => Promise<void>
  fetchExecution: (executionId: string) => Promise<TaskExecution | null>
  runTask: (
    task: Task,
    agent: AgentPersona,
    skill: Skill | undefined,
    accountId: string,
    userId: string
  ) => Promise<TaskExecution | null>
  runTasksParallel: (
    tasks: Array<{ task: Task; agent: AgentPersona; skill?: Skill }>,
    accountId: string,
    userId: string
  ) => Promise<TaskExecution[]>
  isTaskExecuting: (taskId: string) => boolean
  getActiveCount: () => number
  cancelExecution: (executionId: string) => Promise<void>
  clearCurrentExecution: () => void
}

export const useExecutionStore = create<ExecutionState>((set, get) => ({
  executions: [],
  currentExecution: null,
  activeExecutions: new Map(),
  isLoading: false,
  isExecuting: false,
  executionStatus: 'idle',
  error: null,

  fetchExecutions: async (accountId: string, taskId?: string) => {
    if (!supabase) return

    set({ isLoading: true, error: null })

    try {
      let query = supabase
        .from('task_executions')
        .select('*')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })

      if (taskId) {
        query = query.eq('task_id', taskId)
      }

      const { data, error } = await query.limit(50)

      if (error) throw error

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const executions: TaskExecution[] = (data || []).map((row: any) => ({
        id: row.id,
        taskId: row.task_id,
        agentId: row.agent_id,
        accountId: row.account_id,
        skillId: row.skill_id,
        status: row.status,
        inputPrompt: row.input_prompt,
        inputContext: row.input_context,
        outputContent: row.output_content,
        outputMetadata: row.output_metadata,
        errorMessage: row.error_message,
        errorDetails: row.error_details,
        requiresApproval: row.requires_approval,
        approvalReason: row.approval_reason,
        approvedBy: row.approved_by,
        approvedAt: row.approved_at,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        createdAt: row.created_at,
        triggeredBy: row.triggered_by,
        triggeredByType: row.triggered_by_type,
      }))

      set({ executions, isLoading: false })
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch executions',
      })
    }
  },

  fetchExecution: async (executionId: string) => {
    if (!supabase) return null

    try {
      const { data, error } = await supabase
        .from('task_executions')
        .select('*')
        .eq('id', executionId)
        .single()

      if (error) throw error

      const execution: TaskExecution = {
        id: data.id,
        taskId: data.task_id,
        agentId: data.agent_id,
        accountId: data.account_id,
        skillId: data.skill_id,
        status: data.status,
        inputPrompt: data.input_prompt,
        inputContext: data.input_context,
        outputContent: data.output_content,
        outputMetadata: data.output_metadata,
        errorMessage: data.error_message,
        errorDetails: data.error_details,
        requiresApproval: data.requires_approval,
        approvalReason: data.approval_reason,
        approvedBy: data.approved_by,
        approvedAt: data.approved_at,
        startedAt: data.started_at,
        completedAt: data.completed_at,
        createdAt: data.created_at,
        triggeredBy: data.triggered_by,
        triggeredByType: data.triggered_by_type,
      }

      return execution
    } catch (error) {
      console.error('Failed to fetch execution:', error)
      return null
    }
  },

  runTask: async (task, agent, skill, accountId, userId) => {
    if (!supabase) {
      set({ error: 'Database not configured' })
      return null
    }

    // Check if this specific task is already executing
    if (get().activeExecutions.has(task.id)) {
      console.log(`[Execution] Task ${task.id} already executing, skipping`)
      return null
    }

    // Per-agent queue isolation: check concurrency limit
    const queueConfig = configFromPersona(agent)
    if (!reserveSlot(agent.id, task.id, queueConfig)) {
      const msg = `Agent "${agent.alias}" is at capacity (max ${queueConfig.maxConcurrent} concurrent tasks). Task stays queued and will auto-retry.`
      console.log(`[Execution] ${msg}`)
      set({ error: msg })
      return null
    }

    try {
      // Create execution record
      const { data: execData, error: insertError } = await supabase
        .from('task_executions')
        .insert({
          task_id: task.id,
          agent_id: agent.id,
          account_id: accountId,
          skill_id: skill?.id || null,
          status: 'running',
          input_context: {
            taskTitle: task.title,
            taskDescription: task.description,
            agentAlias: agent.alias,
            skillName: skill?.name,
          },
          started_at: new Date().toISOString(),
          triggered_by: userId,
          triggered_by_type: 'user',
        })
        .select()
        .single()

      if (insertError) throw insertError

      const executionId = execData.id

      // Create execution object
      const execution: TaskExecution = {
        id: executionId,
        taskId: task.id,
        agentId: agent.id,
        accountId,
        skillId: skill?.id,
        status: 'running',
        inputContext: {
          taskTitle: task.title,
          taskDescription: task.description,
          agentAlias: agent.alias,
          skillName: skill?.name,
        },
        requiresApproval: false,
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        triggeredBy: userId,
        triggeredByType: 'user',
      }

      // Track this execution in activeExecutions
      const newActive = new Map(get().activeExecutions)
      newActive.set(task.id, execution)
      set({
        activeExecutions: newActive,
        isExecuting: true,
        executionStatus: 'idle',
        error: null,
        currentExecution: execution,
      })

      console.log(`[Execution] Started task "${task.title}" (${get().activeExecutions.size} active)`)

      // Status callback
      const onStatusChange: ExecutionStatusCallback = (status, detail) => {
        set({ executionStatus: status === 'using_tools' ? 'calling_api' : status })
        if (detail) {
          console.log(`[Execution] Status: ${status} - ${detail}`)
        }
      }

      // Build additional context from completed sibling subtasks (for dependent tasks)
      let additionalContext: string | undefined
      if (task.parentTaskId) {
        // Fetch completed sibling tasks
        const { data: siblings } = await supabase
          .from('tasks')
          .select('id, title, output, status, completed_at')
          .eq('parent_task_id', task.parentTaskId)
          .neq('id', task.id)
          .in('status', ['completed', 'review'])
          .order('created_at', { ascending: true })

        if (siblings && siblings.length > 0) {
          const siblingOutputs = siblings
            .filter((s) => s.output && Object.keys(s.output).length > 0)
            .map((s) => {
              const output = s.output as Record<string, unknown>
              const content = output.content ? String(output.content) : JSON.stringify(output)
              return `## ${s.title}\n\n${content}`
            })
            .join('\n\n---\n\n')

          if (siblingOutputs) {
            additionalContext = `The following work has been completed by other team members on this project:\n\n${siblingOutputs}\n\nUse this context to inform your work and ensure consistency with what has already been done.`
            console.log(`[Execution] Providing context from ${siblings.length} completed sibling tasks`)
          }
        }
      }

      // Execute the task with tools enabled and sibling context
      const result: ExecutionResult = await executeTask(
        { task, agent, skill, additionalContext, accountId, userId, enableTools: true },
        onStatusChange
      )

      // Update execution record with result
      const updateData: Record<string, unknown> = {
        status: result.success ? 'completed' : 'failed',
        output_content: result.content,
        output_metadata: result.metadata,
        completed_at: new Date().toISOString(),
      }

      if (!result.success && result.error) {
        updateData.error_message = result.error
      }

      const { error: updateError } = await supabase
        .from('task_executions')
        .update(updateData)
        .eq('id', executionId)

      if (updateError) {
        console.error('Failed to update execution:', updateError)
      }

      // Update task status based on execution result
      console.log(`[Execution] Task "${task.title}" completed. Success: ${result.success}`)

      // Determine appropriate status for successful tasks:
      // - Subtasks auto-complete UNLESS they are QA/Review tasks
      // - Parent tasks (with subtasks) go to review for output verification
      // - Single-step standalone tasks auto-complete
      // - QA/Review tasks go to review for human approval
      let newStatus: string = 'queued'
      if (result.success) {
        const isSubtask = !!task.parentTaskId
        const isQaTask = agent.agentType === 'qa-tester' ||
          /\b(qa|quality\s*assurance|review|final\s*review)\b/i.test(task.title)

        if (isSubtask && !isQaTask) {
          // Intermediate subtasks auto-complete so parent orchestration continues
          newStatus = 'completed'
          console.log(`[Execution] Subtask "${task.title}" auto-completed`)
        } else {
          // All top-level tasks go to review for human approval before completing
          newStatus = 'review'
          console.log(`[Execution] Task "${task.title}" → review for human approval`)
        }
      } else {
        newStatus = 'failed'
        console.log(`[Execution] Task failed, marking as failed. Error: ${result.error}`)
      }

      // Build task output object from execution result
      const taskOutput = result.success && result.content ? {
        content: result.content,
        metadata: result.metadata,
        executionId,
        completedAt: new Date().toISOString(),
      } : task.output

      const { error: taskUpdateError } = await supabase
        .from('tasks')
        .update({
          status: newStatus,
          output: result.success ? taskOutput : task.output,
        })
        .eq('id', task.id)

      if (taskUpdateError) {
        console.error(`[Execution] Failed to update task to ${newStatus}:`, taskUpdateError)
      } else {
        console.log(`[Execution] Task "${task.title}" moved to ${newStatus}`)
        // Update the local taskStore so UI reflects the change immediately
        const taskStore = useTaskStore.getState()
        taskStore.handleRemoteTaskChange({
          ...task,
          status: newStatus as Task['status'],
          output: result.success ? taskOutput : task.output,
          updatedAt: new Date().toISOString(),
        })
      }

      // Self-annealing: feed execution outcome into trust engine
      // This updates agent health, streaks, autonomy, and pattern learning
      processExecutionOutcome({
        executionId,
        taskId: task.id,
        agentId: agent.id,
        accountId,
        success: result.success,
        toolsUsed: (result.metadata.toolsUsed || []).map(t => ({
          name: t.name,
          success: t.success,
        })),
        durationMs: result.metadata.durationMs,
        inputTokens: result.metadata.inputTokens,
        outputTokens: result.metadata.outputTokens,
        patternKey: (task.input as Record<string, unknown>)?.planPatternKey as string | undefined,
      }).catch(err => console.warn('[Execution] Annealing loop error (non-fatal):', err))

      // Parse agent output for files and upload to storage
      let attachments: Attachment[] = []
      if (result.success && result.content) {
        const parsedOutput = parseAgentOutput(result.content)
        if (parsedOutput.hasFiles) {
          console.log(`[Execution] Found ${parsedOutput.files.length} files in output, uploading...`)
          attachments = await uploadAgentOutputFiles(
            parsedOutput.files,
            accountId,
            executionId,
            userId
          )
          console.log(`[Execution] Uploaded ${attachments.length} files as attachments`)
        }
      }

      // Build final execution object
      const finalExecution: TaskExecution = {
        id: executionId,
        taskId: task.id,
        agentId: agent.id,
        accountId,
        skillId: skill?.id,
        status: result.success ? 'completed' : 'failed',
        inputContext: {
          taskTitle: task.title,
          taskDescription: task.description,
          agentAlias: agent.alias,
          skillName: skill?.name,
        },
        outputContent: result.content,
        outputMetadata: result.metadata,
        errorMessage: result.error,
        requiresApproval: false,
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        triggeredBy: userId,
        triggeredByType: 'user',
        attachments,
      }

      // Release per-agent queue slot
      releaseSlot(agent.id, task.id)

      // Remove from active executions
      const updatedActive = new Map(get().activeExecutions)
      updatedActive.delete(task.id)

      console.log(`[Execution] Finished task "${task.title}" (${updatedActive.size} still active)`)

      set({
        activeExecutions: updatedActive,
        currentExecution: finalExecution,
        isExecuting: updatedActive.size > 0,
        executionStatus: updatedActive.size > 0 ? get().executionStatus : 'idle',
      })

      // Refresh executions list
      get().fetchExecutions(accountId, task.id)

      return finalExecution
    } catch (error) {
      // Release per-agent queue slot on error too
      releaseSlot(agent.id, task.id)

      // Remove from active on error too
      const updatedActive = new Map(get().activeExecutions)
      updatedActive.delete(task.id)

      set({
        activeExecutions: updatedActive,
        isExecuting: updatedActive.size > 0,
        executionStatus: 'idle',
        error: error instanceof Error ? error.message : 'Execution failed',
      })
      return null
    }
  },

  isTaskExecuting: (taskId: string) => {
    return get().activeExecutions.has(taskId)
  },

  getActiveCount: () => {
    return get().activeExecutions.size
  },

  runTasksParallel: async (tasks, accountId, userId) => {
    if (!supabase) {
      set({ error: 'Database not configured' })
      return []
    }

    console.log(`[Parallel Execution] Starting ${tasks.length} tasks in parallel`)

    // Run all tasks concurrently
    const results = await Promise.all(
      tasks.map(({ task, agent, skill }) =>
        get().runTask(task, agent, skill, accountId, userId)
      )
    )

    console.log(`[Parallel Execution] Completed ${results.filter(r => r !== null).length}/${tasks.length} tasks`)
    return results.filter((r): r is TaskExecution => r !== null)
  },

  cancelExecution: async (executionId: string) => {
    if (!supabase) return

    try {
      await supabase
        .from('task_executions')
        .update({
          status: 'cancelled',
          completed_at: new Date().toISOString(),
        })
        .eq('id', executionId)

      set({ isExecuting: false, executionStatus: 'idle', currentExecution: null })
    } catch (error) {
      console.error('Failed to cancel execution:', error)
    }
  },

  clearCurrentExecution: () => {
    set({ currentExecution: null, executionStatus: 'idle' })
  },
}))
