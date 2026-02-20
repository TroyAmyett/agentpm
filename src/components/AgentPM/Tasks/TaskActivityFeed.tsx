// Task Activity Feed — Conversational timeline showing the full task lifecycle

import { useMemo } from 'react'
import {
  User,
  Bot,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Play,
} from 'lucide-react'
import type { Task, TaskStatus, AgentPersona, Skill, StatusHistoryEntry, WorkflowGateConfig, OrchestratorPlan } from '@/types/agentpm'
import type { ExecutionPlan } from '@/services/planner/dynamicPlanner'
import { TaskStatusBadge } from './TaskStatusBadge'
import { ResultsCard } from './ResultsCard'
import { ExecutionPanel } from './ExecutionPanel'
import { HumanGatePanel } from '../Workflows/HumanGatePanel'
import { useTimezoneFunctions } from '@/lib/timezone'

interface TaskActivityFeedProps {
  task: Task
  agent?: AgentPersona
  skill?: Skill
  agents?: AgentPersona[]
  accountId?: string
  userId?: string
  onApprovePlan?: (taskId: string, plan: ExecutionPlan) => void
  onApproveOrchestratorPlan?: (taskId: string) => void
  onUpdateStatus?: (taskId: string, status: TaskStatus, note?: string) => void
}

// Unified display plan step (works for both ExecutionPlan and OrchestratorPlan)
interface DisplayPlanStep {
  title: string
  description?: string
  agentAlias: string
  agentId?: string
}

interface DisplayPlan {
  steps: DisplayPlanStep[]
  executionMode: string
  reasoning?: string
  /** Original ExecutionPlan if available (for approval callback) */
  _original?: ExecutionPlan
}

// Timeline event types
type ActivityEvent =
  | { type: 'created'; timestamp: string; description?: string }
  | { type: 'status_change'; timestamp: string; entry: StatusHistoryEntry }
  | { type: 'plan'; timestamp: string; plan: DisplayPlan }
  | { type: 'execution'; timestamp: string }
  | { type: 'result'; timestamp: string; output: Record<string, unknown> }
  | { type: 'error'; timestamp: string; error: { message: string; code?: string } }
  | { type: 'workflow_gate'; timestamp: string; gate: WorkflowGateConfig; runId: string; stepId: string }

export function TaskActivityFeed({
  task,
  agent,
  skill,
  agents = [],
  accountId,
  userId,
  onApprovePlan,
  onApproveOrchestratorPlan,
  onUpdateStatus,
}: TaskActivityFeedProps) {
  const { formatDateTime } = useTimezoneFunctions()

  const taskInput = task.input as Record<string, unknown> | undefined
  const taskOutput = task.output as Record<string, unknown> | undefined

  // Support both ExecutionPlan (from dynamic planner) and OrchestratorPlan (from Atlas)
  const executionPlan = taskInput?.plan as ExecutionPlan | undefined
  const orchestratorPlan = taskOutput?.plan as OrchestratorPlan | undefined

  const plan = executionPlan
  const hasOutput = taskOutput && Object.keys(taskOutput).some(k => k !== 'plan')
  const hasPlan = (plan && plan.steps && plan.steps.length > 0) || (orchestratorPlan && orchestratorPlan.subtasks.length > 0)
  const isOrchestratorPlan = !!orchestratorPlan
  const isPlanReview = task.status === 'review' && hasPlan && !hasOutput

  // Build chronological event list
  const events = useMemo(() => {
    const items: ActivityEvent[] = []

    // 1. Task created
    items.push({
      type: 'created',
      timestamp: task.createdAt,
      description: task.description,
    })

    // 2. Status history entries (skip the first one which is creation)
    if (task.statusHistory && task.statusHistory.length > 0) {
      task.statusHistory.forEach((entry, index) => {
        // Skip the very first status entry (task creation) — it's redundant with 'created'
        if (index === 0) return
        items.push({
          type: 'status_change',
          timestamp: entry.changedAt,
          entry,
        })
      })
    }

    // 3. Plan generated (if exists, insert it near when task went to review)
    if (hasPlan) {
      const reviewEntry = task.statusHistory?.find(e => e.status === 'review')
      const displayPlan: DisplayPlan = orchestratorPlan
        ? {
            steps: orchestratorPlan.subtasks.map(s => ({
              title: s.title,
              description: s.description,
              agentAlias: s.assignToAgentType,
              agentId: s.assignToAgentId,
            })),
            executionMode: 'plan-then-execute',
            reasoning: orchestratorPlan.reasoning,
          }
        : plan
          ? {
              steps: plan.steps.map(s => ({
                title: s.title,
                description: s.description,
                agentAlias: s.agentAlias,
                agentId: s.agentId,
              })),
              executionMode: plan.executionMode,
              reasoning: plan.reasoning,
              _original: plan,
            }
          : { steps: [], executionMode: 'plan-then-execute' }
      items.push({
        type: 'plan',
        timestamp: reviewEntry?.changedAt || task.updatedAt,
        plan: displayPlan,
      })
    }

    // 4. Workflow gate (if task has workflowGate in input)
    const workflowGate = taskInput?.workflowGate as WorkflowGateConfig | undefined
    if (workflowGate && task.workflowRunId && task.workflowStepId && task.status === 'review') {
      const reviewEntry = task.statusHistory?.find(e => e.status === 'review')
      items.push({
        type: 'workflow_gate',
        timestamp: reviewEntry?.changedAt || task.updatedAt,
        gate: workflowGate,
        runId: task.workflowRunId,
        stepId: task.workflowStepId,
      })
    }

    // 5. Execution event (if agent task with execution context)
    if (task.assignedToType === 'agent' && accountId && userId) {
      // If there's output or task is in_progress, there's been an execution
      const startedEntry = task.statusHistory?.find(e => e.status === 'in_progress')
      if (startedEntry || task.status === 'in_progress' || task.status === 'queued') {
        items.push({
          type: 'execution',
          timestamp: startedEntry?.changedAt || task.updatedAt,
        })
      }
    }

    // 5. Result (if has output — shown after execution)
    if (hasOutput) {
      const completedEntry = task.statusHistory?.find(e => e.status === 'completed' || e.status === 'review')
      items.push({
        type: 'result',
        timestamp: completedEntry?.changedAt || task.updatedAt,
        output: task.output as Record<string, unknown>,
      })
    }

    // 6. Error (if failed)
    if (task.error) {
      const failedEntry = task.statusHistory?.find(e => e.status === 'failed')
      items.push({
        type: 'error',
        timestamp: failedEntry?.changedAt || task.updatedAt,
        error: task.error,
      })
    }

    // Sort chronologically
    items.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    // Deduplicate: Remove status_change events that overlap with plan/execution/result events
    // (e.g., don't show "Status: review" separately if the plan card is already there)
    const deduped: ActivityEvent[] = []
    for (const item of items) {
      if (item.type === 'status_change') {
        const status = item.entry.status
        // Skip status changes that are represented by other events
        if (status === 'review' && hasPlan && !hasOutput) continue // plan card handles this
        if (status === 'review' && workflowGate) continue // gate card handles this
        if (status === 'in_progress' && task.assignedToType === 'agent') continue // execution card handles this
        if (status === 'queued' && task.assignedToType === 'agent') continue // execution card handles this
      }
      deduped.push(item)
    }

    return deduped
  }, [task, plan, orchestratorPlan, hasPlan, hasOutput, accountId, userId])

  return (
    <div className="relative space-y-1">
      {/* Timeline connector line */}
      <div className="absolute left-[17px] top-8 bottom-4 w-px bg-surface-200 dark:bg-surface-700" />

      {events.map((event, index) => {
        switch (event.type) {
          case 'created':
            return (
              <ActivityCard key={`created-${index}`} avatar={<UserAvatar />} timestamp={formatDateTime(event.timestamp)}>
                <p className="text-sm text-surface-700 dark:text-surface-300">
                  Created this task
                </p>
                {event.description && (
                  <p className="text-xs text-surface-500 dark:text-surface-400 mt-1 line-clamp-2">
                    {event.description}
                  </p>
                )}
              </ActivityCard>
            )

          case 'status_change':
            return (
              <ActivityCardCompact key={`status-${index}`} timestamp={formatDateTime(event.timestamp)}>
                <div className="flex items-center gap-2">
                  <TaskStatusBadge status={event.entry.status} size="sm" />
                  {event.entry.note && (
                    <span className="text-xs text-surface-500 dark:text-surface-400 truncate">
                      {event.entry.note}
                    </span>
                  )}
                </div>
              </ActivityCardCompact>
            )

          case 'plan':
            return (
              <ActivityCard
                key={`plan-${index}`}
                avatar={<AgentAvatar color="indigo" />}
                timestamp={formatDateTime(event.timestamp)}
                highlighted={isPlanReview}
              >
                <p className="text-sm font-medium text-surface-800 dark:text-surface-200 mb-1">
                  {isPlanReview
                    ? isOrchestratorPlan
                      ? `Atlas prepared ${event.plan.steps.length} step${event.plan.steps.length > 1 ? 's' : ''} — review and approve`
                      : `Prepared ${event.plan.steps.length} step${event.plan.steps.length > 1 ? 's' : ''} — review and run`
                    : `Plan (${event.plan.steps.length} step${event.plan.steps.length > 1 ? 's' : ''})`
                  }
                </p>
                {/* Orchestrator plan summary */}
                {isOrchestratorPlan && orchestratorPlan?.summary && (
                  <p className="text-xs text-surface-500 dark:text-surface-400 mb-2">
                    {orchestratorPlan.summary}
                  </p>
                )}
                {/* Steps */}
                <div className="space-y-1.5 mb-3">
                  {event.plan.steps.map((step, i) => {
                    const stepAgent = agents.find(a => a.id === step.agentId)
                    return (
                      <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-white/60 dark:bg-surface-800/40">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-surface-800 dark:text-surface-200">{step.title}</p>
                          <span className="text-[10px] text-surface-500 dark:text-surface-400">
                            {stepAgent?.alias || step.agentAlias}
                          </span>
                          {step.description && (
                            <p className="text-[10px] text-surface-400 dark:text-surface-500 mt-0.5 line-clamp-2">
                              {step.description}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {/* Orchestrator reasoning */}
                {isOrchestratorPlan && orchestratorPlan?.reasoning && isPlanReview && (
                  <p className="text-[11px] text-surface-400 dark:text-surface-500 italic mb-3">
                    {orchestratorPlan.reasoning}
                  </p>
                )}
                {/* Inline approval */}
                {isPlanReview && (
                  <div className="flex items-center gap-2">
                    {isOrchestratorPlan && onApproveOrchestratorPlan ? (
                      <button
                        onClick={() => onApproveOrchestratorPlan(task.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition-colors"
                      >
                        <Play size={12} />
                        Approve Plan
                      </button>
                    ) : onApprovePlan && event.plan._original ? (
                      <button
                        onClick={() => {
                          const allAtOncePlan = { ...event.plan._original!, executionMode: 'plan-then-execute' as const }
                          onApprovePlan(task.id, allAtOncePlan)
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition-colors"
                      >
                        <Play size={12} />
                        Run All Steps
                      </button>
                    ) : null}
                    <button
                      onClick={() => onUpdateStatus?.(task.id, 'cancelled', 'Plan cancelled')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-200 dark:bg-surface-700 hover:bg-surface-300 dark:hover:bg-surface-600 text-surface-600 dark:text-surface-400 text-xs font-medium transition-colors"
                    >
                      <XCircle size={12} />
                      Cancel
                    </button>
                  </div>
                )}
              </ActivityCard>
            )

          case 'execution':
            return (
              <ActivityCard
                key={`exec-${index}`}
                avatar={
                  task.status === 'in_progress' || task.status === 'queued'
                    ? <AgentAvatar color="primary" pulse />
                    : <AgentAvatar color="primary" />
                }
                timestamp={formatDateTime(event.timestamp)}
              >
                {accountId && userId ? (
                  <ExecutionPanel
                    task={task}
                    agent={agent}
                    skill={skill}
                    accountId={accountId}
                    userId={userId}
                  />
                ) : (
                  <p className="text-sm text-surface-600 dark:text-surface-400">
                    {task.status === 'in_progress' ? 'Agent is working on this task...' : 'Queued for execution'}
                  </p>
                )}
              </ActivityCard>
            )

          case 'result':
            return (
              <ActivityCard
                key={`result-${index}`}
                avatar={<AgentAvatar color="green" />}
                timestamp={formatDateTime(event.timestamp)}
              >
                <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-2 flex items-center gap-1.5">
                  <CheckCircle2 size={12} />
                  {agent?.alias || 'Agent'} completed
                </p>
                <ResultsCard output={event.output} />
              </ActivityCard>
            )

          case 'workflow_gate':
            return (
              <ActivityCard
                key={`gate-${index}`}
                avatar={<AgentAvatar color="indigo" />}
                timestamp={formatDateTime(event.timestamp)}
                highlighted
              >
                <HumanGatePanel
                  runId={event.runId}
                  stepId={event.stepId}
                  taskId={task.id}
                  gate={event.gate}
                  userId={userId || ''}
                  onResponded={() => {
                    // After gate response, the workflow engine marks the task completed
                    // and advances to the next step automatically
                  }}
                />
              </ActivityCard>
            )

          case 'error':
            return (
              <ActivityCard key={`error-${index}`} avatar={<AgentAvatar color="red" />} timestamp={formatDateTime(event.timestamp)}>
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-700 dark:text-red-300 flex items-center gap-1.5">
                    <XCircle size={14} />
                    {event.error.message}
                  </p>
                  {event.error.code && (
                    <p className="text-xs text-red-500 mt-1">Code: {event.error.code}</p>
                  )}
                </div>
              </ActivityCard>
            )

          default:
            return null
        }
      })}

      {/* Empty state */}
      {events.length <= 1 && !hasOutput && task.status === 'draft' && (
        <div className="text-center py-8 text-surface-500 dark:text-surface-400">
          <AlertCircle size={28} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">Move to Ready to start processing</p>
        </div>
      )}
    </div>
  )
}

// --- Sub-components ---

function ActivityCard({
  avatar,
  timestamp,
  highlighted,
  children,
}: {
  avatar: React.ReactNode
  timestamp: string
  highlighted?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`relative flex gap-3 py-3 px-2 rounded-lg transition-colors ${
      highlighted ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''
    }`}>
      <div className="flex-shrink-0 relative z-10">{avatar}</div>
      <div className="flex-1 min-w-0">
        <span className="text-[10px] text-surface-400 dark:text-surface-500 mb-1 block">
          {timestamp}
        </span>
        {children}
      </div>
    </div>
  )
}

function ActivityCardCompact({
  timestamp,
  children,
}: {
  timestamp: string
  children: React.ReactNode
}) {
  return (
    <div className="relative flex items-center gap-3 py-1.5 px-2">
      {/* Small dot instead of avatar */}
      <div className="flex-shrink-0 relative z-10 w-[34px] flex justify-center">
        <div className="w-2 h-2 rounded-full bg-surface-300 dark:bg-surface-600" />
      </div>
      <div className="flex-1 min-w-0 flex items-center gap-2">
        {children}
        <span className="text-[10px] text-surface-400 dark:text-surface-500 ml-auto flex-shrink-0">
          {timestamp}
        </span>
      </div>
    </div>
  )
}

function UserAvatar() {
  return (
    <div className="w-[34px] h-[34px] rounded-full bg-surface-200 dark:bg-surface-700 flex items-center justify-center">
      <User size={16} className="text-surface-500 dark:text-surface-400" />
    </div>
  )
}

function AgentAvatar({ color, pulse }: { color: 'primary' | 'indigo' | 'green' | 'red'; pulse?: boolean }) {
  const colors = {
    primary: 'bg-gradient-to-br from-primary-400 to-purple-500',
    indigo: 'bg-gradient-to-br from-indigo-400 to-blue-500',
    green: 'bg-gradient-to-br from-green-400 to-emerald-500',
    red: 'bg-gradient-to-br from-red-400 to-rose-500',
  }

  return (
    <div className={`w-[34px] h-[34px] rounded-full ${colors[color]} flex items-center justify-center ${pulse ? 'animate-pulse' : ''}`}>
      <Bot size={16} className="text-white" />
    </div>
  )
}
