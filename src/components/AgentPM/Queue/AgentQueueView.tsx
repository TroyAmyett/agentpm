// Agent Queue View - Shows tasks ready for agent execution
// Priority-ordered, capability-matched, with one-click execution

import { useState, useMemo, useCallback } from 'react'
import {
  Play,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Bot,
  Zap,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import type { Task, AgentPersona } from '@/types/agentpm'

interface AgentQueueViewProps {
  tasks: Task[]
  agents: AgentPersona[]
  blockedTasks: Map<string, number>
  executingTaskIds: Set<string>
  onTaskClick: (taskId: string) => void
  onRunTask: (taskId: string) => void
  onBulkRun: (taskIds: string[]) => void
}

type QueueFilter = 'all' | 'ready' | 'blocked' | 'in_progress' | 'queued'

// Priority scoring for queue ordering
const PRIORITY_SCORE: Record<string, number> = {
  critical: 100,
  high: 75,
  medium: 50,
  low: 25,
}

// Estimated costs by agent type (mock - would come from actual usage data)
const ESTIMATED_COSTS: Record<string, number> = {
  researcher: 0.10,
  content: 0.15,
  forge: 0.50,
  orchestrator: 0.05,
  default: 0.10,
}

export function AgentQueueView({
  tasks,
  agents,
  blockedTasks,
  executingTaskIds,
  onTaskClick,
  onRunTask,
  onBulkRun,
}: AgentQueueViewProps) {
  const [filter, setFilter] = useState<QueueFilter>('ready')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set())

  // Create agent lookup
  const agentMap = useMemo(() => {
    const map = new Map<string, AgentPersona>()
    agents.forEach(a => map.set(a.id, a))
    return map
  }, [agents])

  // Filter and sort tasks for queue
  const queuedTasks = useMemo(() => {
    // Filter to tasks that are assigned to agents
    let filtered = tasks.filter(task =>
      task.assignedTo &&
      task.assignedToType === 'agent' &&
      ['pending', 'queued', 'in_progress'].includes(task.status)
    )

    // Apply queue filter
    switch (filter) {
      case 'ready':
        filtered = filtered.filter(t =>
          !blockedTasks.has(t.id) &&
          (t.status === 'pending' || t.status === 'queued')
        )
        break
      case 'blocked':
        filtered = filtered.filter(t => blockedTasks.has(t.id))
        break
      case 'in_progress':
        filtered = filtered.filter(t => t.status === 'in_progress')
        break
      case 'queued':
        filtered = filtered.filter(t => t.status === 'queued')
        break
    }

    // Calculate priority score (urgency + importance + age)
    const now = Date.now()
    const scored = filtered.map(task => {
      let score = PRIORITY_SCORE[task.priority] || 50

      // Age bonus: older tasks get slight priority bump (max +20)
      const ageHours = (now - new Date(task.createdAt).getTime()) / (1000 * 60 * 60)
      score += Math.min(ageHours / 24, 20)

      // Due date urgency: tasks due soon get priority
      if (task.dueAt) {
        const dueIn = new Date(task.dueAt).getTime() - now
        const dueInDays = dueIn / (1000 * 60 * 60 * 24)
        if (dueInDays < 0) score += 50 // Overdue
        else if (dueInDays < 1) score += 30 // Due today
        else if (dueInDays < 3) score += 15 // Due within 3 days
      }

      return { task, score }
    })

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score)

    return scored.map(s => s.task)
  }, [tasks, filter, blockedTasks])

  // Group tasks by agent for agent-centric view
  const tasksByAgent = useMemo(() => {
    const grouped = new Map<string, Task[]>()

    queuedTasks.forEach(task => {
      if (!task.assignedTo) return
      const existing = grouped.get(task.assignedTo) || []
      existing.push(task)
      grouped.set(task.assignedTo, existing)
    })

    return grouped
  }, [queuedTasks])

  // Stats
  const stats = useMemo(() => {
    const agentTasks = tasks.filter(t => t.assignedTo && t.assignedToType === 'agent')
    return {
      total: agentTasks.length,
      ready: agentTasks.filter(t =>
        !blockedTasks.has(t.id) &&
        (t.status === 'pending' || t.status === 'queued')
      ).length,
      blocked: agentTasks.filter(t => blockedTasks.has(t.id)).length,
      inProgress: agentTasks.filter(t => t.status === 'in_progress').length,
    }
  }, [tasks, blockedTasks])

  // Calculate estimated cost for a task
  const getEstimatedCost = useCallback((task: Task) => {
    if (!task.assignedTo) return 0
    const agent = agentMap.get(task.assignedTo)
    const agentType = agent?.agentType || 'default'
    return ESTIMATED_COSTS[agentType] || ESTIMATED_COSTS.default
  }, [agentMap])

  // Toggle agent section
  const toggleAgent = (agentId: string) => {
    setExpandedAgents(prev => {
      const next = new Set(prev)
      if (next.has(agentId)) {
        next.delete(agentId)
      } else {
        next.add(agentId)
      }
      return next
    })
  }

  // Toggle task selection
  const toggleSelection = (taskId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) {
        next.delete(taskId)
      } else {
        next.add(taskId)
      }
      return next
    })
  }

  // Select all visible ready tasks
  const selectAllReady = () => {
    const readyIds = queuedTasks
      .filter(t => !blockedTasks.has(t.id) && !executingTaskIds.has(t.id))
      .map(t => t.id)
    setSelectedIds(new Set(readyIds))
  }

  // Run selected tasks
  const runSelected = () => {
    if (selectedIds.size > 0) {
      onBulkRun(Array.from(selectedIds))
      setSelectedIds(new Set())
    }
  }

  const getStatusIcon = (task: Task) => {
    if (executingTaskIds.has(task.id)) {
      return <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
    }
    if (blockedTasks.has(task.id)) {
      return <AlertTriangle size={16} className="text-yellow-500" />
    }
    if (task.status === 'in_progress') {
      return <Play size={16} className="text-blue-500" />
    }
    if (task.status === 'queued') {
      return <Clock size={16} className="text-cyan-500" />
    }
    return <CheckCircle2 size={16} className="text-green-500" />
  }

  return (
    <div className="flex flex-col h-full bg-surface-50 dark:bg-surface-900">
      {/* Header */}
      <div className="flex-shrink-0 p-4 bg-white dark:bg-surface-800 border-b border-surface-200 dark:border-surface-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-100 dark:bg-cyan-900/30">
              <Zap size={20} className="text-cyan-600 dark:text-cyan-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
                Agent Queue
              </h2>
              <p className="text-sm text-surface-500">
                {stats.ready} ready • {stats.inProgress} running • {stats.blocked} blocked
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <button
                onClick={runSelected}
                className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Play size={14} />
                Run {selectedIds.size} Tasks
              </button>
            )}
            <button
              onClick={selectAllReady}
              className="flex items-center gap-2 px-3 py-1.5 bg-surface-100 dark:bg-surface-700 hover:bg-surface-200 dark:hover:bg-surface-600 text-surface-700 dark:text-surface-300 text-sm font-medium rounded-lg transition-colors"
            >
              <CheckCircle2 size={14} />
              Select All Ready
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 p-1 bg-surface-100 dark:bg-surface-700 rounded-lg">
          {[
            { id: 'ready', label: 'Ready', count: stats.ready },
            { id: 'in_progress', label: 'Running', count: stats.inProgress },
            { id: 'blocked', label: 'Blocked', count: stats.blocked },
            { id: 'all', label: 'All', count: stats.total },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id as QueueFilter)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                filter === tab.id
                  ? 'bg-white dark:bg-surface-600 text-surface-900 dark:text-surface-100 shadow-sm'
                  : 'text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-200'
              }`}
            >
              {tab.label}
              <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                filter === tab.id
                  ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                  : 'bg-surface-200 dark:bg-surface-600 text-surface-500'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Queue List */}
      <div className="flex-1 overflow-auto p-4">
        {queuedTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-surface-500">
            <Zap size={48} className="mb-4 opacity-50" />
            <p className="text-lg font-medium">No tasks in queue</p>
            <p className="text-sm">
              {filter === 'ready'
                ? 'All ready tasks have been executed or moved'
                : 'No tasks match the current filter'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Group by Agent */}
            {Array.from(tasksByAgent.entries()).map(([agentId, agentTasks]) => {
              const agent = agentMap.get(agentId)
              const isExpanded = expandedAgents.has(agentId) || expandedAgents.size === 0
              const readyCount = agentTasks.filter(t =>
                !blockedTasks.has(t.id) && !executingTaskIds.has(t.id)
              ).length
              const runningCount = agentTasks.filter(t => executingTaskIds.has(t.id)).length
              const totalCost = agentTasks.reduce((sum, t) => sum + getEstimatedCost(t), 0)

              return (
                <div key={agentId} className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 overflow-hidden">
                  {/* Agent Header */}
                  <button
                    onClick={() => toggleAgent(agentId)}
                    className="w-full flex items-center justify-between p-4 hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary-400 to-purple-500 flex items-center justify-center">
                        <Bot size={20} className="text-white" />
                      </div>
                      <div className="text-left">
                        <h3 className="font-medium text-surface-900 dark:text-surface-100">
                          {agent?.alias || 'Unknown Agent'}
                        </h3>
                        <p className="text-sm text-surface-500">
                          {agent?.agentType || 'agent'} • {agentTasks.length} tasks
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-sm">
                      {runningCount > 0 && (
                        <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                          {runningCount} running
                        </span>
                      )}
                      <span className="text-green-600 dark:text-green-400">
                        {readyCount} ready
                      </span>
                      <span className="text-surface-500">
                        ~${totalCost.toFixed(2)}
                      </span>
                    </div>
                  </button>

                  {/* Task List */}
                  {isExpanded && (
                    <div className="border-t border-surface-200 dark:border-surface-700">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-surface-50 dark:bg-surface-900/50 text-xs text-surface-500 uppercase">
                            <th className="w-10 px-4 py-2 text-left">
                              <input
                                type="checkbox"
                                checked={agentTasks.every(t => selectedIds.has(t.id))}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedIds(prev => {
                                      const next = new Set(prev)
                                      agentTasks.forEach(t => next.add(t.id))
                                      return next
                                    })
                                  } else {
                                    setSelectedIds(prev => {
                                      const next = new Set(prev)
                                      agentTasks.forEach(t => next.delete(t.id))
                                      return next
                                    })
                                  }
                                }}
                                className="rounded border-surface-300 dark:border-surface-600"
                              />
                            </th>
                            <th className="px-4 py-2 text-left">Task</th>
                            <th className="px-4 py-2 text-left w-24">Priority</th>
                            <th className="px-4 py-2 text-left w-24">Status</th>
                            <th className="px-4 py-2 text-right w-20">Est. Cost</th>
                            <th className="px-4 py-2 text-right w-24">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {agentTasks.map((task) => {
                            const isBlocked = blockedTasks.has(task.id)
                            const isExecuting = executingTaskIds.has(task.id)
                            const isSelected = selectedIds.has(task.id)
                            const cost = getEstimatedCost(task)

                            return (
                              <tr
                                key={task.id}
                                className={`border-t border-surface-100 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-700/30 transition-colors ${
                                  isSelected ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                                }`}
                              >
                                <td className="px-4 py-3">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleSelection(task.id)}
                                    className="rounded border-surface-300 dark:border-surface-600"
                                  />
                                </td>
                                <td className="px-4 py-3">
                                  <button
                                    onClick={() => onTaskClick(task.id)}
                                    className="text-left hover:text-primary-600 dark:hover:text-primary-400"
                                  >
                                    <p className="font-medium text-surface-900 dark:text-surface-100 line-clamp-1">
                                      {task.title}
                                    </p>
                                    {task.description && (
                                      <p className="text-xs text-surface-500 line-clamp-1 mt-0.5">
                                        {task.description}
                                      </p>
                                    )}
                                  </button>
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`inline-flex px-2 py-0.5 text-xs rounded-full ${
                                    task.priority === 'critical'
                                      ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                                      : task.priority === 'high'
                                        ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
                                        : task.priority === 'medium'
                                          ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400'
                                          : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                                  }`}>
                                    {task.priority}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    {getStatusIcon(task)}
                                    <span className="text-sm text-surface-600 dark:text-surface-400">
                                      {isExecuting ? 'Running' : isBlocked ? 'Blocked' : task.status.replace('_', ' ')}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right text-sm text-surface-500">
                                  ${cost.toFixed(2)}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {!isBlocked && !isExecuting && task.status !== 'in_progress' && (
                                    <button
                                      onClick={() => onRunTask(task.id)}
                                      className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-900/50 text-green-600 dark:text-green-400 text-xs font-medium rounded-md transition-colors"
                                    >
                                      <Play size={12} />
                                      Run
                                    </button>
                                  )}
                                  {isExecuting && (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-medium rounded-md">
                                      <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                      Running
                                    </span>
                                  )}
                                  {isBlocked && (
                                    <span className="text-xs text-yellow-600 dark:text-yellow-400">
                                      {blockedTasks.get(task.id)} blockers
                                    </span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default AgentQueueView
