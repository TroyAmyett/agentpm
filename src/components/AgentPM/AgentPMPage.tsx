// AgentPM Page - Main page combining all AgentPM features

import { useState, useEffect, useCallback, useMemo, useTransition, useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  ListTodo,
  Bell,
  Plus,
  FileText,
  Bot,
  Hammer,
  FolderKanban,
  Cpu,
  Settings,
  ExternalLink,
  Workflow,
  MessageSquare,
  User,
  Users,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useAgentStore } from '@/stores/agentStore'
import { useTaskStore } from '@/stores/taskStore'
import { useProjectStore } from '@/stores/projectStore'
import { useAccountStore } from '@/stores/accountStore'
import { useUIStore } from '@/stores/uiStore'
import { useSkillStore } from '@/stores/skillStore'
import { useExecutionStore } from '@/stores/executionStore'
import { AgentDashboard } from './Dashboard'
import { TaskList, TaskDetail, DependencyGraph, GanttView, CalendarView, TableListView } from './Tasks'
import { AgentQueueView } from './Queue'
import { CreateTaskModal, AssignAgentModal, EditTaskModal, AgentDetailModal } from './Modals'
import { ReviewCard } from './Reviews'
import { KanbanView } from './Kanban'
import { ViewSwitcher } from './ViewSwitcher'
import { SkillsPage } from './Skills'
import { AgentsPage } from './Agents'
import { ProjectsPage } from './Projects'
import { VoiceCommandBar, type ParsedVoiceCommand } from '@/components/Voice'
import { ForgeTaskModal } from './Forge'
import { WorkflowsPage } from './Workflows'
import { MessagesPage } from './Messages'
import { routeTask, analyzeTaskForDecomposition } from '@/services/agents/dispatcher'
import { generatePlan } from '@/services/planner'
import type { ExecutionPlan } from '@/services/planner/dynamicPlanner'
import { createSubtasksFromPlan, createNextStep, advancePlanStep, storePlanOnTask, getPlanCurrentStep } from '@/services/planner/planExecutor'
import { advanceWorkflow, handleStepFailure } from '@/services/workflows'
import { BUILT_IN_TOOLS } from '@/services/tools'
import type { Task, TaskStatus, AgentPersona, ForgeTaskInput } from '@/types/agentpm'

type TabId = 'dashboard' | 'projects' | 'tasks' | 'agents' | 'reviews' | 'skills' | 'forge' | 'tools' | 'workflows' | 'messages'

interface Tab {
  id: TabId
  label: string
  icon: React.ReactNode
}

const tabs: Tab[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { id: 'projects', label: 'Projects', icon: <FolderKanban size={18} /> },
  { id: 'tasks', label: 'Tasks', icon: <ListTodo size={18} /> },
  { id: 'forge', label: 'Forge', icon: <Hammer size={18} /> },
  { id: 'agents', label: 'Agents', icon: <Bot size={18} /> },
  { id: 'reviews', label: 'Reviews', icon: <Bell size={18} /> },
  { id: 'skills', label: 'Skills', icon: <FileText size={18} /> },
  { id: 'tools', label: 'Tools', icon: <Cpu size={18} /> },
  { id: 'workflows', label: 'Workflows', icon: <Workflow size={18} /> },
  { id: 'messages', label: 'Messages', icon: <MessageSquare size={18} /> },
]

// Valid tab IDs for URL hash parsing
const VALID_TABS: TabId[] = ['dashboard', 'projects', 'tasks', 'agents', 'reviews', 'skills', 'forge', 'tools', 'workflows', 'messages']

// Get initial tab from URL hash (e.g., #agentpm/tasks)
function getTabFromHash(): TabId {
  const hash = window.location.hash
  // Parse hash like #agentpm/tasks or just check if it contains a tab name
  const match = hash.match(/(?:agentpm\/)?(\w+)$/i)
  if (match) {
    const tabId = match[1].toLowerCase() as TabId
    if (VALID_TABS.includes(tabId)) {
      return tabId
    }
  }
  return 'dashboard'
}

export function AgentPMPage() {
  const [activeTab, setActiveTab] = useState<TabId>(getTabFromHash)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false)
  const [createTaskInitialStatus, setCreateTaskInitialStatus] = useState<Task['status'] | undefined>(undefined)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [assignAgentTask, setAssignAgentTask] = useState<Task | null>(null)
  const [preselectedAgentId, setPreselectedAgentId] = useState<string | undefined>(undefined)
  const [selectedAgent, setSelectedAgent] = useState<AgentPersona | null>(null)
  const [voiceTaskTitle, setVoiceTaskTitle] = useState<string>('')
  const [isForgeTaskOpen, setIsForgeTaskOpen] = useState(false)
  const [taskStatusFilter, setTaskStatusFilter] = useState<TaskStatus | 'all'>('all')
  const [taskProjectFilter, setTaskProjectFilter] = useState<string | 'all'>('all')
  const [_isPending, startTransition] = useTransition()

  const { user } = useAuthStore()
  const { accounts, currentAccountId, fetchAccounts, initializeUserAccounts } = useAccountStore()
  const { agents, fetchAgents, subscribeToAgents, pauseAgent, resumeAgent, resetAgentHealth, setAutonomyOverride, clearAutonomyOverride, getAgent: getAgentFromStore } = useAgentStore()
  const { projects, fetchProjects } = useProjectStore()
  const { taskViewMode, setTaskViewMode, taskOwnerFilter, setTaskOwnerFilter } = useUIStore()
  const { skills, fetchSkills } = useSkillStore()
  const { runTask, isTaskExecuting, getActiveCount, activeExecutions } = useExecutionStore()
  const {
    tasks,
    blockedTasks,
    fetchTasks,
    createTask,
    updateTask,
    updateTaskStatus,
    assignTask,
    deleteTask,
    bulkDeleteTasks,
    subscribeToTasks,
    getTask,
    getPendingReviewTasks,
    createTaskDependency,
    isTaskBlocked,
  } = useTaskStore()

  const userId = user?.id || 'demo-user'
  const accountId = currentAccountId || ''
  const hasValidAccount = Boolean(accountId && !accountId.startsWith('default-') && !accountId.startsWith('demo-'))

  // Create agent name map
  const agentNameMap = new Map<string, string>(
    agents.map((a) => [a.id, a.alias])
  )

  // Initialize user accounts on mount (creates default account if needed)
  useEffect(() => {
    if (user) {
      // User is authenticated - ensure they have an account
      initializeUserAccounts()
    } else {
      // Not authenticated - use default accounts
      fetchAccounts()
    }
  }, [user, fetchAccounts, initializeUserAccounts])

  useEffect(() => {
    if (accountId) {
      fetchAgents(accountId)
      fetchTasks(accountId)
      fetchProjects(accountId)
      fetchSkills(accountId)
    }
  }, [accountId, fetchAgents, fetchTasks, fetchProjects, fetchSkills])

  // Subscribe to realtime updates
  useEffect(() => {
    const unsubAgents = subscribeToAgents(accountId)
    const unsubTasks = subscribeToTasks(accountId)

    return () => {
      unsubAgents()
      unsubTasks()
    }
  }, [accountId, subscribeToAgents, subscribeToTasks])

  // Sync URL hash with active tab (preserving the #agentpm prefix if present)
  useEffect(() => {
    const currentHash = window.location.hash
    const expectedHash = currentHash.includes('agentpm')
      ? `#agentpm/${activeTab}`
      : `#agentpm/${activeTab}`

    if (!currentHash.endsWith(`/${activeTab}`) && !currentHash.endsWith(activeTab)) {
      window.history.replaceState(null, '', expectedHash)
    }
  }, [activeTab])

  // Handle browser back/forward navigation
  useEffect(() => {
    const handleHashChange = () => {
      const newTab = getTabFromHash()
      if (newTab !== activeTab) {
        setActiveTab(newTab)
      }
    }

    window.addEventListener('hashchange', handleHashChange)
    window.addEventListener('popstate', handleHashChange)

    return () => {
      window.removeEventListener('hashchange', handleHashChange)
      window.removeEventListener('popstate', handleHashChange)
    }
  }, [activeTab])

  // === Refs for interval-based task processing ===
  // These refs hold the latest values so interval callbacks can access current state
  // without creating reactive dependency loops (tasks → updateTaskStatus → tasks → ...)
  const tasksRef = useRef(tasks)
  tasksRef.current = tasks
  const agentsRef = useRef(agents)
  agentsRef.current = agents
  const skillsRef = useRef(skills)
  skillsRef.current = skills

  // Track which tasks each watcher has already processed to avoid duplicates
  const queueStartedRef = useRef(new Set<string>())
  const autoQueuedRef = useRef(new Set<string>())
  const autoRoutedRef = useRef(new Set<string>())
  const staleResetRef = useRef(new Set<string>())
  const chainingProcessedRef = useRef(new Set<string>())

  // Queue watcher - auto-process queued tasks with assigned agents (PARALLEL)
  const MAX_PARALLEL_TASKS = 3
  useEffect(() => {
    const interval = setInterval(() => {
      const currentTasks = tasksRef.current
      const activeCount = getActiveCount()
      const availableSlots = MAX_PARALLEL_TASKS - activeCount

      if (availableSlots <= 0) return

      const queuedTasks = currentTasks.filter(
        (t) => t.status === 'queued' &&
               t.assignedTo &&
               t.assignedToType === 'agent' &&
               !isTaskExecuting(t.id) &&
               !queueStartedRef.current.has(t.id)
      )

      if (queuedTasks.length === 0) return

      const tasksToStart = queuedTasks.slice(0, availableSlots)
      console.log(`[Queue Watcher] Starting ${tasksToStart.length} tasks in parallel (${activeCount} already running)`)

      tasksToStart.forEach((queuedTask) => {
        const agent = agentsRef.current.find((a) => a.id === queuedTask.assignedTo)
        if (!agent) {
          console.warn(`[Queue Watcher] Agent not found for "${queuedTask.title}" (assignedTo: ${queuedTask.assignedTo}) — will retry next tick`)
          return // Don't add to queueStartedRef so it retries on next interval
        }

        queueStartedRef.current.add(queuedTask.id)
        console.log(`[Queue Watcher] Starting: "${queuedTask.title}" → ${agent.alias}`)
        const skill = queuedTask.skillId ? skillsRef.current.find((s) => s.id === queuedTask.skillId) : undefined

        updateTaskStatus(queuedTask.id, 'in_progress', userId, 'Auto-started from queue')
          .then(() => runTask(queuedTask, agent, skill, accountId, userId))
          .catch((err) => {
            queueStartedRef.current.delete(queuedTask.id) // Allow retry on failure
            console.error(`[Queue Watcher] Failed to start "${queuedTask.title}":`, err)
          })
      })
    }, 3000)

    return () => clearInterval(interval)
  }, [getActiveCount, isTaskExecuting, updateTaskStatus, runTask, accountId, userId])

  // Auto-queue pending tasks that already have agents assigned
  // NOTE: Sub-tasks (parentTaskId) are excluded - the sub-task chaining interval handles those
  // to ensure dependencies are respected and predecessor outputs are available
  useEffect(() => {
    const interval = setInterval(() => {
      const currentTasks = tasksRef.current
      const pendingWithAgents = currentTasks.filter(
        (t) => {
          if (t.status !== 'pending' || !t.assignedTo || t.assignedToType !== 'agent') return false
          if (t.parentTaskId) return false // Sub-tasks handled by chaining interval
          if (isTaskBlocked(t.id)) return false
          if (autoQueuedRef.current.has(t.id)) return false
          // Skip orchestrator-assigned tasks - the dynamic planner handles those
          const assignedAgent = agentsRef.current.find((a) => a.id === t.assignedTo)
          if (assignedAgent?.agentType === 'orchestrator') return false
          return true
        }
      )

      if (pendingWithAgents.length === 0) return

      console.log(`[Auto-Queue] Found ${pendingWithAgents.length} pending tasks with agents, moving to queued`)

      pendingWithAgents.forEach((task) => {
        autoQueuedRef.current.add(task.id)
        const agent = agentsRef.current.find((a) => a.id === task.assignedTo)
        updateTaskStatus(
          task.id,
          'queued',
          userId,
          `Auto-queued: already assigned to ${agent?.alias || 'agent'}`
        ).catch((err) => {
          autoQueuedRef.current.delete(task.id)
          console.error(`[Auto-Queue] Failed to queue "${task.title}":`, err)
        })
      })
    }, 5000)

    return () => clearInterval(interval)
  }, [updateTaskStatus, userId, isTaskBlocked])

  // Stale task detector - reset stuck in_progress tasks back to failed for cleanup
  useEffect(() => {
    const TEN_MINUTES = 10 * 60 * 1000

    const interval = setInterval(() => {
      const currentTasks = tasksRef.current
      const staleInProgressTasks = currentTasks.filter((t) => {
        if (t.status !== 'in_progress') return false
        if (!t.assignedTo || t.assignedToType !== 'agent') return false
        if (isTaskExecuting(t.id)) return false
        if (staleResetRef.current.has(t.id)) return false

        const lastUpdate = t.statusHistory?.[t.statusHistory.length - 1]
        if (!lastUpdate) return false

        const timeSinceUpdate = Date.now() - new Date(lastUpdate.changedAt).getTime()
        return timeSinceUpdate > TEN_MINUTES
      })

      if (staleInProgressTasks.length === 0) return

      console.log(`[Stale Detector] Found ${staleInProgressTasks.length} stale in_progress tasks`)

      staleInProgressTasks.forEach((task) => {
        staleResetRef.current.add(task.id)
        console.log(`[Stale Detector] Marking stale task "${task.title}" as failed (stuck >10min)`)
        updateTaskStatus(
          task.id,
          'failed',
          userId,
          'Auto-failed: task was stuck in_progress for over 10 minutes'
        ).catch((err) => {
          staleResetRef.current.delete(task.id)
          console.error(`[Stale Detector] Failed to reset "${task.title}":`, err)
        })
      })
    }, 30000) // Check every 30 seconds

    return () => clearInterval(interval)
  }, [updateTaskStatus, userId, isTaskExecuting])

  // Sub-task chaining - when a sub-task completes, queue unblocked dependents
  // Also handles failed subtasks: marks parent as failed so the chain doesn't get stuck
  useEffect(() => {
    const interval = setInterval(() => {
      const currentTasks = tasksRef.current
      const completedSubTasks = currentTasks.filter(
        (t) => (t.status === 'completed' || t.status === 'review') &&
               t.parentTaskId &&
               !chainingProcessedRef.current.has(t.id)
      )

      for (const completedTask of completedSubTasks) {
        const siblingTasks = currentTasks.filter(
          (t) =>
            t.parentTaskId === completedTask.parentTaskId &&
            t.id !== completedTask.id &&
            t.status === 'pending' &&
            t.assignedTo &&
            t.assignedToType === 'agent'
        )

        const unblockedTasks = siblingTasks.filter((t) => !isTaskBlocked(t.id))

        // Queue ALL unblocked siblings (supports parallel steps)
        for (const nextTask of unblockedTasks) {
          console.log(`Sub-task "${completedTask.title}" completed, queueing unblocked: "${nextTask.title}"`)
          updateTaskStatus(nextTask.id, 'queued', userId, `Dependencies satisfied: ${completedTask.title} completed`)
            .catch((err) => console.error('Failed to queue next sub-task:', err))
        }

        // Only mark as processed if there are no more pending siblings,
        // or all pending siblings were successfully queued.
        // If siblings remain blocked (stale blockedTasks map), retry next interval.
        const stillBlockedSiblings = siblingTasks.filter((t) => isTaskBlocked(t.id))
        if (stillBlockedSiblings.length === 0) {
          chainingProcessedRef.current.add(completedTask.id)
        }

        // Check if all sub-tasks are complete - aggregate outputs and mark parent for review
        const allSiblings = currentTasks.filter((t) => t.parentTaskId === completedTask.parentTaskId)
        const allComplete = allSiblings.every((t) => t.status === 'completed' || t.status === 'review')

        if (allComplete && allSiblings.length > 0) {
          const parentTask = currentTasks.find((t) => t.id === completedTask.parentTaskId)
          if (parentTask && parentTask.status === 'in_progress') {
            console.log(`All sub-tasks complete for "${parentTask.title}", aggregating outputs...`)

            const subtaskOutputs = allSiblings
              .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
              .map((subtask) => ({
                taskId: subtask.id,
                title: subtask.title,
                output: subtask.output,
                completedAt: subtask.completedAt,
              }))

            const aggregatedContent = subtaskOutputs
              .map((s) => {
                const content = s.output && typeof s.output === 'object' && 'content' in s.output
                  ? String(s.output.content)
                  : JSON.stringify(s.output)
                return `## ${s.title}\n\n${content}`
              })
              .join('\n\n---\n\n')

            const aggregatedOutput = {
              content: aggregatedContent,
              subtasks: subtaskOutputs,
              aggregatedAt: new Date().toISOString(),
              subtaskCount: allSiblings.length,
            }

            updateTask(parentTask.id, {
              output: aggregatedOutput,
              updatedBy: userId,
              updatedByType: 'user',
            })
              .then(() => {
                console.log(`Aggregated ${allSiblings.length} subtask outputs into parent "${parentTask.title}"`)
                return updateTaskStatus(parentTask.id, 'review', userId, 'All sub-tasks completed - outputs aggregated')
              })
              .catch((err) => console.error('Failed to aggregate and complete parent task:', err))
          }
        }
      }

      // ── Workflow advancement ──────────────────────────────────────────
      // When a subtask with workflowRunId completes, advance the workflow
      const completedWorkflowTasks = currentTasks.filter(
        (t) =>
          t.workflowRunId &&
          t.workflowStepId &&
          t.status === 'completed' &&
          !chainingProcessedRef.current.has(`wf-${t.id}`)
      )

      for (const wfTask of completedWorkflowTasks) {
        chainingProcessedRef.current.add(`wf-${wfTask.id}`)
        console.log(`[Workflow] Step "${wfTask.title}" completed, advancing workflow run ${wfTask.workflowRunId}`)
        advanceWorkflow(
          wfTask.workflowRunId!,
          wfTask.workflowStepId!,
          wfTask.output as Record<string, unknown> | undefined
        ).catch((err) => console.error('[Workflow] Failed to advance workflow:', err))
      }

      // When a workflow subtask fails, mark the workflow run as failed
      const failedWorkflowTasks = currentTasks.filter(
        (t) =>
          t.workflowRunId &&
          t.workflowStepId &&
          t.status === 'failed' &&
          !chainingProcessedRef.current.has(`wf-fail-${t.id}`)
      )

      for (const wfTask of failedWorkflowTasks) {
        chainingProcessedRef.current.add(`wf-fail-${wfTask.id}`)
        console.warn(`[Workflow] Step "${wfTask.title}" failed, marking workflow run ${wfTask.workflowRunId} as failed`)
        handleStepFailure(
          wfTask.workflowRunId!,
          wfTask.workflowStepId!,
          wfTask.error?.message || 'Step task failed'
        ).catch((err) => console.error('[Workflow] Failed to handle step failure:', err))
      }

      // Handle failed subtasks — propagate failure to parent so the chain doesn't get stuck
      const failedSubTasks = currentTasks.filter(
        (t) => t.status === 'failed' &&
               t.parentTaskId &&
               !chainingProcessedRef.current.has(`failed-${t.id}`)
      )

      for (const failedTask of failedSubTasks) {
        chainingProcessedRef.current.add(`failed-${failedTask.id}`)

        const parentTask = currentTasks.find((t) => t.id === failedTask.parentTaskId)
        if (!parentTask || parentTask.status !== 'in_progress') continue

        const allSiblings = currentTasks.filter((t) => t.parentTaskId === failedTask.parentTaskId)
        const hasRunning = allSiblings.some((t) => t.status === 'in_progress' || t.status === 'queued')

        // If other siblings are still running, wait for them to finish
        if (hasRunning) continue

        // No siblings still running — check final state
        const anyFailed = allSiblings.some((t) => t.status === 'failed')
        const allSettled = allSiblings.every(
          (t) => t.status === 'completed' || t.status === 'review' || t.status === 'failed' || t.status === 'cancelled'
        )

        if (anyFailed && allSettled) {
          const failedNames = allSiblings.filter((t) => t.status === 'failed').map((t) => t.title)
          console.warn(`Sub-task chain failed for "${parentTask.title}": ${failedNames.join(', ')}`)

          const failedError = failedTask.error?.message || 'Unknown error'
          updateTask(parentTask.id, {
            error: { message: `Sub-task failed: ${failedNames.join(', ')}`, code: 'SUBTASK_FAILED' },
            updatedBy: userId,
            updatedByType: 'user',
          })
            .then(() => updateTaskStatus(
              parentTask.id, 'failed', userId,
              `Sub-task "${failedTask.title}" failed: ${failedError}`
            ))
            .catch((err) => console.error('Failed to mark parent as failed:', err))
        }
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [updateTask, updateTaskStatus, userId, isTaskBlocked])

  // Handle task creation - new tasks go to Inbox (draft) by default
  const handleCreateTask = useCallback(
    async (taskData: {
      title: string
      description?: string
      priority: Task['priority']
      dueAt?: string
      assignedTo?: string
      assignedToType?: 'user' | 'agent'
      projectId?: string
      skillId?: string
      input?: ForgeTaskInput
      status?: Task['status']
    }) => {
      // Use provided status or default to draft (Inbox)
      // Auto-routing happens when moved to 'pending' (Ready column)
      await createTask({
        ...taskData,
        accountId,
        status: taskData.status || 'draft', // Default to Inbox if no status provided
        createdBy: userId,
        createdByType: 'user',
        updatedBy: userId,
        updatedByType: 'user',
      } as Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'statusHistory'>)
    },
    [accountId, userId, createTask]
  )

  // Handle Forge task creation
  const handleCreateForgeTask = useCallback(
    async (taskData: {
      title: string
      description?: string
      priority: Task['priority']
      assignedTo: string
      assignedToType: 'agent'
      projectId?: string
      input: ForgeTaskInput
    }) => {
      await createTask({
        title: taskData.title,
        description: taskData.description,
        priority: taskData.priority,
        assignedTo: taskData.assignedTo,
        assignedToType: taskData.assignedToType,
        projectId: taskData.projectId,
        input: taskData.input as unknown as Record<string, unknown>,
        accountId,
        status: 'queued', // Forge tasks start as queued
        createdBy: userId,
        createdByType: 'user',
        updatedBy: userId,
        updatedByType: 'user',
      } as Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'statusHistory'>)
    },
    [accountId, userId, createTask]
  )

  // Handle status update - auto-route when moving to Ready, auto-execute when queued
  const handleUpdateStatus = useCallback(
    async (taskId: string, status: TaskStatus, note?: string) => {
      const task = getTask(taskId)
      if (!task) return

      // SMART ROUTING: When moving to 'pending' (Ready column), analyze and route
      // Triggers for: unassigned tasks OR tasks assigned to an orchestrator agent
      const assignedAgent = task.assignedTo ? agents.find((a) => a.id === task.assignedTo) : null
      const isOrchestratorAssigned = assignedAgent?.agentType === 'orchestrator'
      if (status === 'pending' && (!task.assignedTo || task.assignedToType !== 'agent' || isOrchestratorAssigned)) {
        console.log(`[Dispatch] Task "${task.title}" moved to Ready - analyzing for decomposition...`)
        console.log(`[Dispatch] Task has assignedTo: ${task.assignedTo}, type: ${task.assignedToType}, isOrchestrator: ${isOrchestratorAssigned}`)

        // Find the Dispatch/orchestrator agent for createdBy attribution
        const dispatchAgent = agents.find((a) => a.agentType === 'orchestrator' && a.isActive)

        // Dynamic Planner: Generate an action plan based on available agents, tools, and trust scores
        // Only plan root tasks (no parentTaskId) to avoid recursive planning
        // Also check if subtasks already exist (prevents duplicate planning on re-renders)
        const existingSubtasks = tasks.filter(t => t.parentTaskId === task.id)
        if (!task.parentTaskId && existingSubtasks.length === 0) {
          console.log(`[Planner] Generating plan for "${task.title}"...`)
          const plan = await generatePlan(task, agents, accountId)

          if (plan && plan.steps.length > 0) {
            console.log(`[Planner] Plan: ${plan.steps.length} steps, confidence: ${(plan.confidence.score * 100).toFixed(0)}% (${plan.executionMode})`)

            const createTaskFn = async (data: Record<string, unknown>) => {
              return createTask(data as unknown as Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'statusHistory'>)
            }

            if (plan.steps.length > 1) {
              // Multi-step plan: auto-execute regardless of confidence level
              // User moved the task to Ready — that IS the approval
              const confPct = (plan.confidence.score * 100).toFixed(0)
              await updateTaskStatus(taskId, 'in_progress', userId,
                `Auto-executing ${plan.steps.length}-step plan (confidence: ${confPct}%, mode: ${plan.executionMode})`)
              await storePlanOnTask(taskId, plan)

              const createdIds = await createSubtasksFromPlan(
                plan.steps, task, accountId, userId, createTaskFn, createTaskDependency
              )
              console.log(`[Planner] Auto-executing (${plan.executionMode}): created ${createdIds.length} subtasks`)
              return
            }

            // Single-step plan: route directly to the assigned agent
            if (plan.steps.length === 1) {
              const step = plan.steps[0]
              console.log(`[Planner] Single-step plan → ${step.agentAlias} (${plan.confidence.reasoning})`)
              await storePlanOnTask(taskId, plan)
              await assignTask(taskId, step.agentId, 'agent', userId)
              await updateTaskStatus(taskId, 'queued', userId,
                `Planned → ${step.agentAlias} (confidence: ${(plan.confidence.score * 100).toFixed(0)}%)`)
              return
            }
          }

          // Fallback: if planner returned null, try legacy decomposition
          console.log(`[Planner] Falling back to legacy decomposition...`)
          const decomposition = await analyzeTaskForDecomposition(task, agents)
          if (decomposition.isMultiStep && decomposition.steps.length > 1) {
            await updateTaskStatus(taskId, 'in_progress', userId, 'Decomposing into sub-tasks...')

            const createdSubTaskIds: string[] = []
            for (let i = 0; i < decomposition.steps.length; i++) {
              const step = decomposition.steps[i]
              const stepAgent = agents.find(
                (a) => a.agentType === step.agentType && a.isActive && !a.pausedAt
              ) || agents.find((a) => a.isActive && !a.pausedAt && a.agentType !== 'orchestrator')

              if (!stepAgent) continue

              const hasDependency = step.dependsOnIndex != null && step.dependsOnIndex >= 0
              const creatorId = dispatchAgent?.id || userId
              const creatorType = dispatchAgent ? 'agent' as const : 'user' as const

              const subTask = await createTask({
                title: step.title,
                description: `${step.description}\n\n---\nPart of: ${task.title}`,
                priority: task.priority,
                projectId: task.projectId,
                parentTaskId: task.id,
                accountId,
                status: (i === 0 || !hasDependency) ? 'queued' as const : 'pending' as const,
                assignedTo: stepAgent.id,
                assignedToType: 'agent' as const,
                createdBy: creatorId,
                createdByType: creatorType,
                updatedBy: creatorId,
                updatedByType: creatorType,
              } as unknown as Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'statusHistory'>)

              if (subTask) {
                createdSubTaskIds.push(subTask.id)
                if (hasDependency && step.dependsOnIndex! < createdSubTaskIds.length) {
                  try {
                    await createTaskDependency(subTask.id, createdSubTaskIds[step.dependsOnIndex!], accountId, creatorId)
                  } catch (depErr) {
                    console.error('Failed to create task dependency:', depErr)
                  }
                }
              }
            }
            return
          }
        }

        // Single-step task: route directly to best agent
        const routingDecision = await routeTask({ task, agents })
        if (routingDecision) {
          console.log(`Dispatch routed task to ${routingDecision.agentAlias}: ${routingDecision.reasoning}`)
          // Assign agent and move directly to queued
          await assignTask(taskId, routingDecision.agentId, 'agent', userId)
          await updateTaskStatus(taskId, 'queued', userId, `Dispatch assigned to ${routingDecision.agentAlias}`)
          // The queue watcher will pick it up
          return
        }
      }

      // Normal status update
      await updateTaskStatus(taskId, status, userId, note)

      // Auto-execute when task is queued or in_progress and assigned to an agent
      if ((status === 'queued' || status === 'in_progress') && !isTaskExecuting(taskId)) {
        const updatedTask = getTask(taskId)
        if (updatedTask?.assignedTo && updatedTask.assignedToType === 'agent') {
          const agent = agents.find((a) => a.id === updatedTask.assignedTo)
          const skill = updatedTask.skillId ? skills.find((s) => s.id === updatedTask.skillId) : undefined
          if (agent) {
            // Move to in_progress first, then run
            if (status === 'queued') {
              await updateTaskStatus(taskId, 'in_progress', userId, 'Auto-started from queue')
            }
            runTask(updatedTask, agent, skill, accountId, userId)
          }
        }
      }
    },
    [userId, updateTaskStatus, isTaskExecuting, getTask, agents, skills, runTask, accountId, assignTask, createTask, tasks]
  )

  // Ref for handleUpdateStatus so the auto-router interval can call it without dependency churn
  const handleUpdateStatusRef = useRef(handleUpdateStatus)
  handleUpdateStatusRef.current = handleUpdateStatus

  // Auto-route unassigned pending tasks (e.g., tasks created from Projects page with 'pending' status)
  // These bypass handleUpdateStatus on creation, so the smart routing never triggers.
  // This interval detects them and triggers routing.
  useEffect(() => {
    const interval = setInterval(() => {
      const currentTasks = tasksRef.current
      const unassignedPending = currentTasks.filter((t) => {
        if (t.status !== 'pending') return false
        // Skip tasks already assigned to a non-orchestrator agent (auto-queue handles those)
        if (t.assignedTo && t.assignedToType === 'agent') {
          const agent = agentsRef.current.find((a) => a.id === t.assignedTo)
          if (agent && agent.agentType !== 'orchestrator') return false
        }
        if (t.parentTaskId) return false // Sub-tasks handled by chaining
        if (autoRoutedRef.current.has(t.id)) return false
        return true
      })

      if (unassignedPending.length === 0) return

      console.log(`[Auto-Route] Found ${unassignedPending.length} unassigned pending tasks, triggering smart routing`)

      unassignedPending.forEach((task) => {
        autoRoutedRef.current.add(task.id)
        handleUpdateStatusRef.current(task.id, 'pending', 'Auto-routed from pending').catch((err) => {
          autoRoutedRef.current.delete(task.id)
          console.error(`[Auto-Route] Failed to route "${task.title}":`, err)
        })
      })
    }, 6000) // Slightly offset from auto-queue (5s) to avoid collision

    return () => clearInterval(interval)
  }, [])

  // Handle agent assignment - auto-execute immediately
  const handleAssignAgent = useCallback(
    async (agentId: string) => {
      if (!assignAgentTask) return
      await assignTask(assignAgentTask.id, agentId, 'agent', userId)

      const agent = agents.find((a) => a.id === agentId)
      if (!agent || isTaskExecuting(assignAgentTask.id)) {
        setAssignAgentTask(null)
        return
      }

      // Move to in_progress and execute immediately
      await updateTaskStatus(assignAgentTask.id, 'in_progress', userId, 'Agent assigned - auto-starting')

      const skill = assignAgentTask.skillId
        ? skills.find((s) => s.id === assignAgentTask.skillId)
        : undefined
      const updatedTask = { ...assignAgentTask, assignedTo: agentId, assignedToType: 'agent' as const }
      runTask(updatedTask, agent, skill, accountId, userId)

      setAssignAgentTask(null)
    },
    [assignAgentTask, assignTask, updateTaskStatus, userId, agents, isTaskExecuting, skills, runTask, accountId]
  )

  // Handle plan approval - creates subtasks from the stored plan
  const handleApprovePlan = useCallback(
    async (taskId: string, plan: ExecutionPlan) => {
      const task = getTask(taskId)
      if (!task) return

      try {
        const createTaskFn = async (data: Record<string, unknown>) => {
          return await createTask(data as unknown as Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'statusHistory'>)
        }

        if (plan.executionMode === 'step-by-step') {
          // Step-by-step: create next step only
          const currentStep = getPlanCurrentStep(task)
          const stepId = await createNextStep(plan, currentStep, task, accountId, userId, createTaskFn)
          if (stepId) {
            await advancePlanStep(taskId)
            await updateTaskStatus(taskId, 'in_progress', userId, `Approved step ${currentStep + 1} of ${plan.steps.length}`)
          }
        } else {
          // Plan-then-execute: create all subtasks at once
          await createSubtasksFromPlan(plan.steps, task, accountId, userId, createTaskFn, createTaskDependency)
          await updateTaskStatus(taskId, 'in_progress', userId, 'Plan approved - executing all steps')
        }
      } catch (err) {
        console.error(`[Plan Approval] Failed to execute plan for "${task.title}":`, err)
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        await updateTask(taskId, {
          error: { message: `Plan execution failed: ${errorMsg}`, code: 'PLAN_EXECUTION_ERROR' },
          updatedBy: userId,
          updatedByType: 'user',
        }).catch(() => {})
        await updateTaskStatus(taskId, 'failed', userId, `Plan execution failed: ${errorMsg}`).catch(() => {})
      }
    },
    [getTask, createTask, accountId, userId, updateTaskStatus, updateTask, createTaskDependency]
  )

  // Handle orchestrator plan approval (Atlas dry-run)
  const handleApproveOrchestratorPlan = useCallback(
    async (taskId: string) => {
      const task = getTask(taskId)
      if (!task) return

      try {
        // Set plan_approved flag and re-queue for orchestrator execution
        const existingInput = (task.input as Record<string, unknown>) || {}
        await updateTask(taskId, {
          input: { ...existingInput, plan_approved: true },
          status: 'queued',
          updatedBy: userId,
          updatedByType: 'user',
        })
        await updateTaskStatus(taskId, 'queued', userId, 'Orchestrator plan approved — executing')
      } catch (err) {
        console.error(`[Orchestrator Plan Approval] Failed for "${task.title}":`, err)
      }
    },
    [getTask, updateTask, updateTaskStatus, userId]
  )

  // Handle task deletion
  const handleDeleteTask = useCallback(
    async (taskId: string) => {
      try {
        await deleteTask(taskId, userId)
        setSelectedTaskId(null)
      } catch (err) {
        console.error('Failed to delete task:', err)
        alert('Failed to delete task. Please try again.')
      }
    },
    [deleteTask, userId]
  )

  const handleBulkDeleteTasks = useCallback(
    async (taskIds: string[]) => {
      try {
        await bulkDeleteTasks(taskIds, userId)
      } catch (err) {
        console.error('Failed to bulk delete tasks:', err)
        alert('Failed to delete tasks. Please try again.')
      }
    },
    [bulkDeleteTasks, userId]
  )

  // Handle rerun with feedback — appends user feedback to task description and requeues
  const handleRerunWithFeedback = useCallback(
    async (taskId: string, feedback: string) => {
      try {
        const task = tasks.find(t => t.id === taskId)
        if (!task) return
        const feedbackNote = `\n\n---\n**Feedback (rerun):** ${feedback}`
        const updatedDescription = (task.description || '') + feedbackNote
        await updateTask(taskId, { description: updatedDescription })
        await updateTaskStatus(taskId, 'queued', userId, `Rerun with feedback: ${feedback.slice(0, 100)}`)
      } catch (err) {
        console.error('Failed to rerun with feedback:', err)
        alert('Failed to rerun task. Please try again.')
      }
    },
    [tasks, updateTask, updateTaskStatus, userId]
  )

  // Handle task edit
  const handleEditTask = useCallback(
    async (taskId: string, updates: {
      title: string
      description?: string
      priority: Task['priority']
      dueAt?: string
      projectId?: string | null
      assignedTo?: string | null
      assignedToType?: 'user' | 'agent'
      skillId?: string | null
    }) => {
      await updateTask(taskId, {
        title: updates.title,
        description: updates.description,
        priority: updates.priority,
        dueAt: updates.dueAt,
        projectId: updates.projectId ?? undefined,
        assignedTo: updates.assignedTo ?? undefined,
        assignedToType: updates.assignedToType,
        skillId: updates.skillId ?? undefined,
        updatedBy: userId,
        updatedByType: 'user',
      })
      setEditingTask(null)
    },
    [updateTask, userId]
  )

  // Handle agent pause
  const handlePauseAgent = useCallback(
    async (agentId: string) => {
      await pauseAgent(agentId, userId, 'Paused by user')
    },
    [pauseAgent, userId]
  )

  // Handle agent resume
  const handleResumeAgent = useCallback(
    async (agentId: string) => {
      await resumeAgent(agentId, userId)
    },
    [resumeAgent, userId]
  )

  // Handle agent health reset
  const handleResetAgentHealth = useCallback(
    async (agentId: string) => {
      await resetAgentHealth(agentId, userId)
    },
    [resetAgentHealth, userId]
  )

  const selectedTask = selectedTaskId ? getTask(selectedTaskId) : null
  const selectedTaskAgent = selectedTask?.assignedTo
    ? agents.find((a) => a.id === selectedTask.assignedTo)
    : undefined
  const selectedTaskSkill = selectedTask?.skillId
    ? skills.find((s) => s.id === selectedTask.skillId)
    : undefined

  const pendingReviews = getPendingReviewTasks()

  // Create a Set of executing task IDs for AgentQueueView
  const executingTaskIds = new Set(activeExecutions.keys())

  // Filter tasks by project and owner
  const filteredTasks = useMemo(() => {
    let result = tasks

    // Project filter
    if (taskProjectFilter !== 'all') {
      result = result.filter(t => t.projectId === taskProjectFilter)
    }

    // Owner filter (My Tasks / Agent / All)
    if (taskOwnerFilter === 'mine' && userId) {
      result = result.filter(t =>
        (t.createdBy === userId && t.createdByType === 'user') ||
        (t.assignedTo === userId && t.assignedToType === 'user')
      )
    } else if (taskOwnerFilter === 'agent') {
      result = result.filter(t =>
        t.createdByType === 'agent' ||
        t.assignedToType === 'agent'
      )
    }

    return result
  }, [tasks, taskProjectFilter, taskOwnerFilter, userId])

  // Handle voice commands
  const handleVoiceCommand = useCallback(
    (command: ParsedVoiceCommand) => {
      console.log('Voice command received:', command)
      switch (command.intent) {
        case 'create_task':
          console.log('Creating task with title:', command.title || command.rawText)
          setVoiceTaskTitle(command.title || command.rawText)
          setIsCreateTaskOpen(true)
          break
        case 'create_note':
          // TODO: Switch to notes view and create note
          console.log('Create note:', command.title)
          break
        case 'status_query':
          // TODO: Show project status
          console.log('Status query:', command.project)
          break
        case 'run_agent':
          // TODO: Trigger agent manually
          console.log('Run agent:', command.agent)
          break
        case 'switch_account':
          // Find and switch to account
          const targetAccount = accounts.find(
            (a) => a.name.toLowerCase() === command.title?.toLowerCase()
          )
          if (targetAccount) {
            useAccountStore.getState().selectAccount(targetAccount.id)
          }
          break
        default:
          // Unknown intent - could show raw text in a note
          console.log('Unknown command:', command.rawText)
      }
    },
    [accounts]
  )

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--fl-color-bg-base)' }}>
      {/* Tab Bar */}
      <div className="flex-shrink-0 border-b border-white/[0.06]" style={{ background: 'var(--fl-color-bg-elevated)' }}>
        <div className="flex items-center justify-center px-3">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => startTransition(() => setActiveTab(tab.id))}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-all ${
                activeTab === tab.id
                  ? 'border-cyan-400 text-cyan-400'
                  : 'border-transparent text-surface-400 hover:text-surface-200'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.id === 'reviews' && pendingReviews.length > 0 && (
                <span className="px-1.5 py-0.5 text-xs rounded-md border bg-orange-500/10 border-orange-500/20 text-orange-400">
                  {pendingReviews.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'dashboard' && (
          <AgentDashboard
            accountId={accountId}
            userId={userId}
            onCreateTask={() => setIsCreateTaskOpen(true)}
            onKpiClick={(target) => {
              // Map KPI target to task status filter and navigate
              if (target === 'active_agents') {
                setActiveTab('agents')
              } else {
                const statusMap: Record<string, TaskStatus | 'all'> = {
                  completed: 'completed',
                  in_progress: 'in_progress',
                  review: 'review',
                }
                setTaskStatusFilter(statusMap[target] || 'all')
                setActiveTab('tasks')
                // Switch to list view for filtered viewing
                setTaskViewMode('list')
              }
            }}
          />
        )}

        {activeTab === 'projects' && <ProjectsPage />}

        {activeTab === 'tasks' && (
          <div className="flex flex-col h-full">
            {/* View Switcher Bar */}
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-white dark:bg-surface-800 border-b border-surface-200 dark:border-surface-700">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-surface-600 dark:text-surface-400">
                  {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''}
                  {taskOwnerFilter === 'mine' && ' (mine)'}
                  {taskOwnerFilter === 'agent' && ' (agent)'}
                  {taskProjectFilter !== 'all' && ` in ${projects.find(p => p.id === taskProjectFilter)?.name || 'project'}`}
                </span>
                {/* Project Filter */}
                <select
                  value={taskProjectFilter}
                  onChange={(e) => setTaskProjectFilter(e.target.value)}
                  className="px-3 py-1.5 text-sm rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="all">All Projects</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>

                {/* Owner Filter: All / My Tasks / Agent */}
                <div className="flex items-center rounded-lg border border-surface-300 dark:border-surface-600 overflow-hidden">
                  {([
                    { value: 'all' as const, label: 'All', icon: <Users size={14} /> },
                    { value: 'mine' as const, label: 'My Tasks', icon: <User size={14} /> },
                    { value: 'agent' as const, label: 'Agent', icon: <Bot size={14} /> },
                  ]).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setTaskOwnerFilter(opt.value)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ${
                        taskOwnerFilter === opt.value
                          ? 'bg-cyan-500/10 text-cyan-400 border-r border-surface-300 dark:border-surface-600'
                          : 'bg-white dark:bg-surface-700 text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-600 border-r border-surface-300 dark:border-surface-600 last:border-r-0'
                      }`}
                    >
                      {opt.icon}
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <ViewSwitcher
                currentView={taskViewMode}
                onViewChange={(view) => setTaskViewMode(view)}
              />
            </div>

            {/* Content based on view mode */}
            <div className="flex-1 overflow-hidden">
              {taskViewMode === 'kanban' && (
                <KanbanView
                  tasks={filteredTasks}
                  agents={agentNameMap}
                  onTaskClick={setSelectedTaskId}
                  onAddTask={(columnId) => {
                    // Map column IDs to task statuses (e.g., 'inbox' → 'draft', 'ready' → 'pending')
                    const COLUMN_TO_STATUS: Record<string, Task['status']> = {
                      inbox: 'draft',
                      ready: 'pending',
                      queued: 'queued',
                      in_progress: 'in_progress',
                      review: 'review',
                      done: 'completed',
                    }
                    setCreateTaskInitialStatus(COLUMN_TO_STATUS[columnId] || 'draft')
                    setIsCreateTaskOpen(true)
                  }}
                  onStatusChange={(taskId, status) => handleUpdateStatus(taskId, status)}
                  onBulkDelete={handleBulkDeleteTasks}
                />
              )}

              {taskViewMode === 'list' && (
                <div className="h-full p-4">
                  <TableListView
                    tasks={filteredTasks}
                    agents={agents}
                    projects={projects}
                    blockedTasks={blockedTasks}
                    executingTaskIds={executingTaskIds}
                    onTaskClick={setSelectedTaskId}
                    onAddTask={() => setIsCreateTaskOpen(true)}
                    onBulkDelete={handleBulkDeleteTasks}
                    onRunTask={(taskId) => {
                      const task = getTask(taskId)
                      if (!task?.assignedTo) return
                      const agent = agents.find(a => a.id === task.assignedTo)
                      if (!agent) return
                      const skill = task.skillId ? skills.find(s => s.id === task.skillId) : undefined
                      updateTaskStatus(taskId, 'in_progress', userId, 'Started from list view')
                        .then(() => runTask(task, agent, skill, accountId, userId))
                    }}
                  />
                </div>
              )}

              {taskViewMode === 'agent-tasks' && (
                <div className="flex h-full">
                  {/* Task List (Card View) */}
                  <div className="w-96 flex-shrink-0 bg-white dark:bg-surface-800 border-r border-surface-200 dark:border-surface-700">
                    <TaskList
                      tasks={filteredTasks}
                      agents={agentNameMap}
                      blockedTasks={blockedTasks}
                      selectedTaskId={selectedTaskId}
                      onSelectTask={setSelectedTaskId}
                      onCreateTask={() => setIsCreateTaskOpen(true)}
                      onBulkDelete={handleBulkDeleteTasks}
                      initialStatusFilter={taskStatusFilter}
                    />
                  </div>

                  {/* Task Detail */}
                  <div className="flex-1">
                    <AnimatePresence mode="wait">
                      {selectedTask ? (
                        <TaskDetail
                          key={selectedTask.id}
                          task={selectedTask}
                          agent={selectedTaskAgent}
                          skill={selectedTaskSkill}
                          allTasks={tasks}
                          accountId={accountId}
                          userId={userId}
                          agents={agents}
                          onClose={() => setSelectedTaskId(null)}
                          onUpdateStatus={handleUpdateStatus}
                          onDelete={() => handleDeleteTask(selectedTask.id)}
                          onEdit={() => setEditingTask(selectedTask)}
                          onDependencyChange={() => fetchTasks(accountId)}
                          onApprovePlan={handleApprovePlan}
                          onApproveOrchestratorPlan={handleApproveOrchestratorPlan}
                          onRerunWithFeedback={handleRerunWithFeedback}
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-surface-500">
                          <div className="text-center">
                            <ListTodo size={48} className="mx-auto mb-4 opacity-50" />
                            <p className="text-lg font-medium">Select a task</p>
                            <p className="text-sm">Choose a task from the list to view details</p>
                          </div>
                        </div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )}

              {taskViewMode === 'graph' && (
                <DependencyGraph
                  tasks={filteredTasks}
                  onTaskClick={setSelectedTaskId}
                />
              )}

              {taskViewMode === 'gantt' && (
                <GanttView
                  tasks={filteredTasks}
                  onTaskClick={setSelectedTaskId}
                />
              )}

              {taskViewMode === 'calendar' && (
                <CalendarView
                  tasks={filteredTasks}
                  onTaskClick={setSelectedTaskId}
                />
              )}

              {taskViewMode === 'queue' && (
                <AgentQueueView
                  tasks={filteredTasks}
                  agents={agents}
                  blockedTasks={blockedTasks}
                  executingTaskIds={executingTaskIds}
                  onTaskClick={setSelectedTaskId}
                  onRunTask={(taskId) => {
                    const task = getTask(taskId)
                    if (!task?.assignedTo) return
                    const agent = agents.find(a => a.id === task.assignedTo)
                    if (!agent) return
                    const skill = task.skillId ? skills.find(s => s.id === task.skillId) : undefined
                    updateTaskStatus(taskId, 'in_progress', userId, 'Started from queue')
                      .then(() => runTask(task, agent, skill, accountId, userId))
                  }}
                  onBulkRun={(taskIds) => {
                    taskIds.forEach(taskId => {
                      const task = getTask(taskId)
                      if (!task?.assignedTo) return
                      const agent = agents.find(a => a.id === task.assignedTo)
                      if (!agent) return
                      const skill = task.skillId ? skills.find(s => s.id === task.skillId) : undefined
                      updateTaskStatus(taskId, 'in_progress', userId, 'Started from queue (bulk)')
                        .then(() => runTask(task, agent, skill, accountId, userId))
                    })
                  }}
                />
              )}
            </div>

            {/* Task Detail Sidebar for List/Table View */}
            {taskViewMode === 'list' && selectedTask && (
              <div className="fixed top-14 bottom-0 right-0 w-[480px] bg-white dark:bg-surface-800 border-l border-surface-200 dark:border-surface-700 shadow-xl z-40">
                <TaskDetail
                  task={selectedTask}
                  agent={selectedTaskAgent}
                  skill={selectedTaskSkill}
                  allTasks={tasks}
                  accountId={accountId}
                  userId={userId}
                  agents={agents}
                  onClose={() => setSelectedTaskId(null)}
                  onUpdateStatus={handleUpdateStatus}
                  onDelete={() => handleDeleteTask(selectedTask.id)}
                  onEdit={() => setEditingTask(selectedTask)}
                  onDependencyChange={() => fetchTasks(accountId)}
                  onApprovePlan={handleApprovePlan}
                  onApproveOrchestratorPlan={handleApproveOrchestratorPlan}
                  onRerunWithFeedback={handleRerunWithFeedback}
                />
              </div>
            )}

            {/* Task Detail Sidebar for Kanban View */}
            {taskViewMode === 'kanban' && selectedTask && (
              <div className="fixed top-14 bottom-0 right-0 w-[480px] bg-white dark:bg-surface-800 border-l border-surface-200 dark:border-surface-700 shadow-xl z-40">
                <TaskDetail
                  task={selectedTask}
                  agent={selectedTaskAgent}
                  skill={selectedTaskSkill}
                  allTasks={tasks}
                  accountId={accountId}
                  userId={userId}
                  agents={agents}
                  onClose={() => setSelectedTaskId(null)}
                  onUpdateStatus={handleUpdateStatus}
                  onDelete={() => handleDeleteTask(selectedTask.id)}
                  onEdit={() => setEditingTask(selectedTask)}
                  onDependencyChange={() => fetchTasks(accountId)}
                  onApprovePlan={handleApprovePlan}
                  onApproveOrchestratorPlan={handleApproveOrchestratorPlan}
                  onRerunWithFeedback={handleRerunWithFeedback}
                />
              </div>
            )}

            {/* Task Detail Sidebar for Gantt View */}
            {taskViewMode === 'gantt' && selectedTask && (
              <div className="fixed top-14 bottom-0 right-0 w-[480px] bg-white dark:bg-surface-800 border-l border-surface-200 dark:border-surface-700 shadow-xl z-40">
                <TaskDetail
                  task={selectedTask}
                  agent={selectedTaskAgent}
                  skill={selectedTaskSkill}
                  allTasks={tasks}
                  accountId={accountId}
                  userId={userId}
                  agents={agents}
                  onClose={() => setSelectedTaskId(null)}
                  onUpdateStatus={handleUpdateStatus}
                  onDelete={() => handleDeleteTask(selectedTask.id)}
                  onEdit={() => setEditingTask(selectedTask)}
                  onDependencyChange={() => fetchTasks(accountId)}
                  onApprovePlan={handleApprovePlan}
                  onApproveOrchestratorPlan={handleApproveOrchestratorPlan}
                  onRerunWithFeedback={handleRerunWithFeedback}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'reviews' && (
          <div className="h-full overflow-auto p-6">
            <div className="max-w-2xl mx-auto space-y-4">
              <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-4">
                Pending Reviews ({pendingReviews.length})
              </h2>

              {pendingReviews.length === 0 ? (
                <div className="text-center py-12 text-surface-500">
                  <Bell size={48} className="mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No pending reviews</p>
                  <p className="text-sm">All agent work has been reviewed</p>
                </div>
              ) : (
                pendingReviews.map((task) => (
                  <ReviewCard
                    key={task.id}
                    review={{
                      id: `review-${task.id}`,
                      taskId: task.id,
                      agentId: task.assignedTo!,
                      status: 'pending',
                      accountId,
                      createdAt: task.updatedAt,
                      createdBy: task.assignedTo!,
                      createdByType: 'agent',
                      updatedAt: task.updatedAt,
                      updatedBy: task.assignedTo!,
                      updatedByType: 'agent',
                    }}
                    task={task}
                    agent={agents.find((a) => a.id === task.assignedTo)}
                    onClick={() => {
                      setSelectedTaskId(task.id)
                      setActiveTab('tasks')
                    }}
                  />
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'agents' && <AgentsPage />}

        {activeTab === 'forge' && (
          <div className="h-full overflow-auto p-6">
            <div className="max-w-4xl mx-auto">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center">
                    <Hammer className="text-orange-500" size={24} />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100">
                      Forge
                    </h1>
                    <p className="text-surface-500">
                      Transform PRDs into working code with AI
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsForgeTaskOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-lg transition-colors"
                >
                  <Plus size={16} />
                  New Forge Task
                </button>
              </div>

              {/* Forge Tasks */}
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-surface-700 dark:text-surface-300">
                  Recent Forge Tasks
                </h2>
                {tasks.filter((t) => {
                  const forgeAgent = agents.find((a) => a.agentType === 'forge')
                  return forgeAgent && t.assignedTo === forgeAgent.id
                }).length === 0 ? (
                  <div className="text-center py-12 bg-surface-100 dark:bg-surface-800 rounded-xl border-2 border-dashed border-surface-300 dark:border-surface-600">
                    <Hammer size={48} className="mx-auto mb-4 text-surface-400" />
                    <p className="text-lg font-medium text-surface-600 dark:text-surface-400">
                      No Forge tasks yet
                    </p>
                    <p className="text-sm text-surface-500 mt-1 mb-4">
                      Create a task to start implementing PRDs with AI
                    </p>
                    <button
                      onClick={() => setIsForgeTaskOpen(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-lg transition-colors"
                    >
                      <Plus size={16} />
                      Create Forge Task
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {tasks
                      .filter((t) => {
                        const forgeAgent = agents.find((a) => a.agentType === 'forge')
                        return forgeAgent && t.assignedTo === forgeAgent.id
                      })
                      .map((task) => (
                        <div
                          key={task.id}
                          onClick={() => {
                            setSelectedTaskId(task.id)
                            setActiveTab('tasks')
                          }}
                          className="p-4 bg-white dark:bg-surface-800 rounded-lg border border-surface-200 dark:border-surface-700 hover:border-orange-500 cursor-pointer transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="font-medium text-surface-900 dark:text-surface-100">
                                {task.title}
                              </h3>
                              <p className="text-sm text-surface-500 mt-1">
                                {task.description?.slice(0, 100)}...
                              </p>
                            </div>
                            <span
                              className={`px-2 py-1 text-xs rounded-full ${
                                task.status === 'completed'
                                  ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                                  : task.status === 'in_progress'
                                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                    : task.status === 'failed'
                                      ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                                      : 'bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-400'
                              }`}
                            >
                              {task.status.replace('_', ' ')}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* Getting Started */}
              <div className="mt-8 p-6 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 rounded-xl border border-orange-200 dark:border-orange-800">
                <h3 className="font-semibold text-orange-800 dark:text-orange-300 mb-3">
                  How Forge Works
                </h3>
                <ol className="space-y-2 text-sm text-orange-700 dark:text-orange-400">
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-orange-500 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                    <span>Write a PRD (Product Requirements Document) describing what you want to build</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-orange-500 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                    <span>Point Forge to your repository and configure branch settings</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-orange-500 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                    <span>Forge uses Claude Code to implement the PRD, running tests along the way</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-orange-500 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
                    <span>Review the changes and approve the pull request when ready</span>
                  </li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'skills' && <SkillsPage />}

        {activeTab === 'tools' && (
          <div className="h-full overflow-auto p-6">
            <div className="max-w-3xl mx-auto">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                    <Cpu className="text-cyan-500" size={24} />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100">
                      Agent Tools
                    </h1>
                    <p className="text-surface-500">
                      Real-time capabilities for task execution
                    </p>
                  </div>
                </div>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    // Navigate to settings - this would need to be connected to your routing
                    window.dispatchEvent(new CustomEvent('navigate-to-settings', { detail: { tab: 'agent-tools' } }))
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-cyan-600 hover:text-cyan-700 dark:text-cyan-400 dark:hover:text-cyan-300 transition-colors"
                >
                  <Settings size={16} />
                  Manage in Settings
                  <ExternalLink size={14} />
                </a>
              </div>

              {/* Info Banner */}
              <div className="p-4 bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800 rounded-xl mb-6">
                <p className="text-sm text-cyan-700 dark:text-cyan-300">
                  Tools give agents real-time capabilities during task execution. When an agent needs current data or verification, it automatically uses the appropriate tool.
                </p>
              </div>

              {/* Tools Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {BUILT_IN_TOOLS.map((tool) => (
                  <div
                    key={tool.id}
                    className="p-4 bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center flex-shrink-0">
                        {tool.name.includes('domain') ? (
                          <span className="text-lg">🌐</span>
                        ) : tool.name.includes('search') ? (
                          <span className="text-lg">🔍</span>
                        ) : tool.name.includes('dns') ? (
                          <span className="text-lg">📡</span>
                        ) : (
                          <span className="text-lg">🔗</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-surface-900 dark:text-surface-100">
                            {tool.displayName}
                          </h3>
                          <span
                            className={`px-1.5 py-0.5 text-xs rounded ${
                              tool.isEnabled
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                            }`}
                          >
                            {tool.isEnabled ? 'Active' : 'Disabled'}
                          </span>
                        </div>
                        <p className="text-sm text-surface-500 mt-1">
                          {tool.description}
                        </p>
                        {tool.requiresApiKey && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                            ⚠️ Requires API key configuration
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Usage Info */}
              <div className="mt-8 p-6 bg-surface-100 dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700">
                <h3 className="font-semibold text-surface-900 dark:text-surface-100 mb-3">
                  How Tools Work
                </h3>
                <ol className="space-y-2 text-sm text-surface-600 dark:text-surface-400">
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-500 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                    <span>When a task runs, agents are told which tools are available</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-500 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                    <span>If the agent needs real data (like checking domain availability), it requests to use a tool</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-500 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                    <span>The tool executes and returns live results to the agent</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-500 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
                    <span>The agent incorporates the real data into its response</span>
                  </li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'workflows' && (
          <WorkflowsPage
            accountId={accountId}
            userId={user?.id || ''}
            agents={agents}
          />
        )}

        {activeTab === 'messages' && (
          <MessagesPage
            accountId={accountId}
            agents={agents}
          />
        )}
      </div>

      {/* Modals */}
      <CreateTaskModal
        isOpen={isCreateTaskOpen}
        onClose={() => {
          setIsCreateTaskOpen(false)
          setPreselectedAgentId(undefined)
          setVoiceTaskTitle('')
          setCreateTaskInitialStatus(undefined)
        }}
        onSubmit={handleCreateTask}
        agents={agents}
        skills={skills}
        projects={projects}
        defaultAgentId={preselectedAgentId}
        defaultTitle={voiceTaskTitle}
        currentUserId={userId}
        currentUserName={user?.email?.split('@')[0] || 'Me'}
        initialStatus={createTaskInitialStatus}
        hasValidAccount={hasValidAccount}
      />

      {editingTask && (
        <EditTaskModal
          isOpen={true}
          onClose={() => setEditingTask(null)}
          onSubmit={(updates) => handleEditTask(editingTask.id, updates)}
          task={editingTask}
          agents={agents}
          projects={projects}
          skills={skills}
          currentUserId={userId}
          currentUserName={user?.email?.split('@')[0] || 'Me'}
        />
      )}

      {assignAgentTask && (
        <AssignAgentModal
          isOpen={true}
          onClose={() => setAssignAgentTask(null)}
          onAssign={handleAssignAgent}
          task={assignAgentTask}
          agents={agents}
        />
      )}

      {selectedAgent && (
        <AgentDetailModal
          isOpen={true}
          onClose={() => setSelectedAgent(null)}
          agent={selectedAgent}
          onPause={handlePauseAgent}
          onResume={handleResumeAgent}
          onResetHealth={handleResetAgentHealth}
          onAssignTask={(agentId) => {
            setSelectedAgent(null)
            setPreselectedAgentId(agentId)
            setIsCreateTaskOpen(true)
          }}
          onSetAutonomyOverride={async (agentId, level) => {
            await setAutonomyOverride(agentId, level, userId)
            const updated = getAgentFromStore(agentId)
            if (updated) setSelectedAgent(updated)
          }}
          onClearAutonomyOverride={async (agentId) => {
            await clearAutonomyOverride(agentId, userId)
            const updated = getAgentFromStore(agentId)
            if (updated) setSelectedAgent(updated)
          }}
        />
      )}

      <ForgeTaskModal
        isOpen={isForgeTaskOpen}
        onClose={() => setIsForgeTaskOpen(false)}
        onSubmit={handleCreateForgeTask}
        agents={agents}
        projects={projects}
        projectId={undefined}
      />

      {/* Voice Command Bar - Fixed at bottom */}
      <div className="flex-shrink-0 bg-white dark:bg-surface-800 border-t border-surface-200 dark:border-surface-700 p-4">
        <VoiceCommandBar
          onCommand={handleVoiceCommand}
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          agents={agents.map((a) => ({ id: a.id, alias: a.alias, agentType: a.agentType }))}
          accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        />
      </div>
    </div>
  )
}
