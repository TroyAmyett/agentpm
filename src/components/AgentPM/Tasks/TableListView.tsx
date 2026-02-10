// Table List View - Data table with sortable columns
import { useState, useMemo } from 'react'
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  ListTodo,
  ChevronRight,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Play,
  Eye,
  Bot,
  User,
  Calendar,
  Link2,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import type { Task, TaskStatus, TaskPriority, AgentPersona, Project } from '@/types/agentpm'
import { useTimezoneFunctions } from '@/lib/timezone'
import { ConfirmDialog } from '../Modals'

interface TableListViewProps {
  tasks: Task[]
  agents: AgentPersona[]
  projects: Project[]
  blockedTasks: Map<string, number>
  executingTaskIds: Set<string>
  onTaskClick: (taskId: string) => void
  onRunTask?: (taskId: string) => void
  onAddTask?: () => void
  onBulkDelete?: (taskIds: string[]) => Promise<void>
}

type SortField = 'title' | 'status' | 'priority' | 'assignee' | 'dueAt' | 'createdAt' | 'updatedAt'
type SortDirection = 'asc' | 'desc'

const priorityOrder: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

const statusOrder: Record<TaskStatus, number> = {
  in_progress: 0,
  queued: 1,
  pending: 2,
  review: 3,
  completed: 4,
  failed: 5,
  draft: 6,
  cancelled: 7,
}

const priorityConfig: Record<TaskPriority, { label: string; color: string }> = {
  critical: { label: 'Critical', color: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' },
  high: { label: 'High', color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' },
  medium: { label: 'Medium', color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400' },
  low: { label: 'Low', color: 'bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-400' },
}

const statusConfig: Record<TaskStatus, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { label: 'Draft', color: 'text-surface-400', icon: <Clock size={14} /> },
  pending: { label: 'Pending', color: 'text-yellow-500', icon: <Clock size={14} /> },
  queued: { label: 'Queued', color: 'text-blue-500', icon: <Clock size={14} /> },
  in_progress: { label: 'In Progress', color: 'text-blue-500', icon: <Play size={14} /> },
  review: { label: 'Review', color: 'text-purple-500', icon: <Eye size={14} /> },
  completed: { label: 'Completed', color: 'text-green-500', icon: <CheckCircle2 size={14} /> },
  failed: { label: 'Failed', color: 'text-red-500', icon: <AlertTriangle size={14} /> },
  cancelled: { label: 'Cancelled', color: 'text-surface-400', icon: <Clock size={14} /> },
}

export function TableListView({
  tasks,
  agents,
  projects,
  blockedTasks,
  executingTaskIds,
  onTaskClick,
  onAddTask,
  onBulkDelete,
}: TableListViewProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<SortField>('createdAt')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'all'>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  const { formatDate } = useTimezoneFunctions()

  // Create agent lookup map
  const agentMap = useMemo(() => {
    const map = new Map<string, AgentPersona>()
    agents.forEach((agent) => map.set(agent.id, agent))
    return map
  }, [agents])

  // Create project lookup map
  const projectMap = useMemo(() => {
    const map = new Map<string, Project>()
    projects.forEach((project) => map.set(project.id, project))
    return map
  }, [projects])

  // Filter and sort tasks
  const filteredTasks = useMemo(() => {
    let result = tasks

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (task) =>
          task.title.toLowerCase().includes(query) ||
          task.description?.toLowerCase().includes(query)
      )
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((task) => task.status === statusFilter)
    }

    // Priority filter
    if (priorityFilter !== 'all') {
      result = result.filter((task) => task.priority === priorityFilter)
    }

    // Sort
    result = [...result].sort((a, b) => {
      let comparison = 0

      switch (sortField) {
        case 'title':
          comparison = a.title.localeCompare(b.title)
          break
        case 'status':
          comparison = statusOrder[a.status] - statusOrder[b.status]
          break
        case 'priority':
          comparison = priorityOrder[a.priority] - priorityOrder[b.priority]
          break
        case 'assignee': {
          const aAssignee = a.assignedTo ? agentMap.get(a.assignedTo)?.alias || '' : ''
          const bAssignee = b.assignedTo ? agentMap.get(b.assignedTo)?.alias || '' : ''
          comparison = aAssignee.localeCompare(bAssignee)
          break
        }
        case 'dueAt': {
          const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Infinity
          const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Infinity
          comparison = aDue - bDue
          break
        }
        case 'createdAt':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          break
        case 'updatedAt':
          comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
          break
      }

      return sortDirection === 'asc' ? comparison : -comparison
    })

    return result
  }, [tasks, searchQuery, statusFilter, priorityFilter, sortField, sortDirection, agentMap])

  // Selection helpers
  const visibleSelectedIds = useMemo(() => {
    const visibleIds = new Set(filteredTasks.map((t) => t.id))
    return new Set([...selectedIds].filter((id) => visibleIds.has(id)))
  }, [selectedIds, filteredTasks])

  const allVisibleSelected = filteredTasks.length > 0 && visibleSelectedIds.size === filteredTasks.length

  const toggleSelection = (taskId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  const selectAllVisible = () => {
    setSelectedIds(new Set(filteredTasks.map((t) => t.id)))
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const SortHeader = ({ field, label, className = '' }: { field: SortField; label: string; className?: string }) => {
    const isActive = sortField === field
    return (
      <th
        className={`px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider cursor-pointer hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors select-none ${className}`}
        onClick={() => handleSort(field)}
      >
        <div className="flex items-center gap-1">
          <span>{label}</span>
          {isActive ? (
            sortDirection === 'asc' ? (
              <ArrowUp size={14} className="text-primary-500" />
            ) : (
              <ArrowDown size={14} className="text-primary-500" />
            )
          ) : (
            <ArrowUpDown size={14} className="opacity-30" />
          )}
        </div>
      </th>
    )
  }

  return (
    <div className="flex flex-col h-full bg-surface-50 dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700">
      {/* Toolbar */}
      <div className="flex items-center gap-3 p-4 border-b border-surface-200 dark:border-surface-700">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
          <input
            type="text"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-100 dark:bg-surface-700 text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        {/* Filters */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as TaskStatus | 'all')}
          className="px-3 py-2 text-sm rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-100 dark:bg-surface-700 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="all">All Status</option>
          <option value="draft">Draft</option>
          <option value="pending">Pending</option>
          <option value="queued">Queued</option>
          <option value="in_progress">In Progress</option>
          <option value="review">Review</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as TaskPriority | 'all')}
          className="px-3 py-2 text-sm rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-100 dark:bg-surface-700 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="all">All Priority</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        {/* Task count */}
        <span className="text-sm text-surface-500">
          {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''}
        </span>

        {/* Create Task */}
        {onAddTask && (
          <button
            onClick={onAddTask}
            className="ml-auto flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors"
          >
            <Plus size={16} />
            <span>Create Task</span>
          </button>
        )}
      </div>

      {/* Bulk Action Bar */}
      {visibleSelectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-primary-50 dark:bg-primary-900/20 border-b border-primary-200 dark:border-primary-800">
          <span className="text-sm font-medium text-primary-700 dark:text-primary-300">
            {visibleSelectedIds.size} selected
          </span>
          <button
            onClick={allVisibleSelected ? clearSelection : selectAllVisible}
            className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
          >
            {allVisibleSelected ? 'Clear selection' : `Select all ${filteredTasks.length}`}
          </button>
          <div className="flex-1" />
          <button
            onClick={clearSelection}
            className="p-1.5 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-500 transition-colors"
            title="Clear selection"
          >
            <X size={16} />
          </button>
          {onBulkDelete && (
            <button
              onClick={() => setShowConfirmDelete(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
            >
              <Trash2 size={14} />
              Delete
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-surface-500">
            <ListTodo size={48} className="mb-4 opacity-30" />
            <p className="text-lg font-medium">No tasks found</p>
            <p className="text-sm">
              {tasks.length === 0 ? 'Create your first task to get started' : 'Try adjusting your filters'}
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-surface-50 dark:bg-surface-900 border-b border-surface-200 dark:border-surface-700">
              <tr>
                {/* Select All Checkbox */}
                <th className="px-3 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={allVisibleSelected ? clearSelection : selectAllVisible}
                    className="w-4 h-4 rounded border-surface-300 dark:border-surface-600 text-primary-600 focus:ring-primary-500 cursor-pointer"
                  />
                </th>
                <SortHeader field="title" label="Task" className="min-w-[280px]" />
                <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">
                  Project
                </th>
                <SortHeader field="status" label="Status" />
                <SortHeader field="priority" label="Priority" />
                <SortHeader field="assignee" label="Assignee" />
                <SortHeader field="dueAt" label="Due Date" />
                <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">
                  Blocked
                </th>
                <SortHeader field="updatedAt" label="Updated" />
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100 dark:divide-surface-700">
              {filteredTasks.map((task) => {
                const blockedCount = blockedTasks.get(task.id)
                const isBlocked = blockedCount !== undefined && blockedCount > 0
                const isExecuting = executingTaskIds.has(task.id)
                const assignee = task.assignedTo ? agentMap.get(task.assignedTo) : null
                const status = statusConfig[task.status]
                const priority = priorityConfig[task.priority]
                const isSelected = selectedIds.has(task.id)

                return (
                  <tr
                    key={task.id}
                    onClick={() => onTaskClick(task.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-primary-50 dark:bg-primary-900/20'
                        : isExecuting
                          ? 'bg-primary-50 dark:bg-primary-900/20'
                          : isBlocked
                            ? 'bg-red-50/50 dark:bg-red-900/10'
                            : 'bg-surface-50 dark:bg-surface-800 hover:bg-surface-100 dark:hover:bg-surface-750'
                    }`}
                  >
                    {/* Row Checkbox */}
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelection(task.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 rounded border-surface-300 dark:border-surface-600 text-primary-600 focus:ring-primary-500 cursor-pointer"
                      />
                    </td>

                    {/* Task Name */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-medium text-surface-900 dark:text-surface-100 truncate max-w-[300px]">
                          {task.title}
                        </span>
                        {task.description && (
                          <span className="text-xs text-surface-500 truncate max-w-[300px]">
                            {task.description}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Project */}
                    <td className="px-4 py-3">
                      {task.projectId ? (
                        <span className="text-sm text-surface-700 dark:text-surface-300 truncate max-w-[120px] block">
                          {projectMap.get(task.projectId)?.name || '—'}
                        </span>
                      ) : (
                        <span className="text-sm text-surface-400">—</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <div className={`flex items-center gap-1.5 text-sm ${status.color}`}>
                        {isExecuting ? (
                          <div className="w-3.5 h-3.5 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
                        ) : (
                          status.icon
                        )}
                        <span>{isExecuting ? 'Running' : status.label}</span>
                      </div>
                    </td>

                    {/* Priority */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${priority.color}`}>
                        {priority.label}
                      </span>
                    </td>

                    {/* Assignee */}
                    <td className="px-4 py-3">
                      {assignee ? (
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                            <Bot size={12} className="text-primary-600 dark:text-primary-400" />
                          </div>
                          <span className="text-sm text-surface-700 dark:text-surface-300 truncate max-w-[100px]">
                            {assignee.alias}
                          </span>
                        </div>
                      ) : task.createdByType === 'user' ? (
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-surface-200 dark:bg-surface-600 flex items-center justify-center">
                            <User size={12} className="text-surface-500" />
                          </div>
                          <span className="text-sm text-surface-500">Unassigned</span>
                        </div>
                      ) : (
                        <span className="text-sm text-surface-400">—</span>
                      )}
                    </td>

                    {/* Due Date */}
                    <td className="px-4 py-3">
                      {task.dueAt ? (
                        <div className="flex items-center gap-1.5 text-sm">
                          <Calendar size={14} className="text-surface-400" />
                          <span className={`${
                            new Date(task.dueAt) < new Date() && task.status !== 'completed'
                              ? 'text-red-500'
                              : 'text-surface-600 dark:text-surface-400'
                          }`}>
                            {formatDate(task.dueAt, 'short')}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-surface-400">—</span>
                      )}
                    </td>

                    {/* Blocked By */}
                    <td className="px-4 py-3">
                      {isBlocked ? (
                        <div className="flex items-center gap-1">
                          <Link2 size={14} className="text-red-500" />
                          <span className="text-sm text-red-500">
                            {blockedCount}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-surface-400">—</span>
                      )}
                    </td>

                    {/* Updated */}
                    <td className="px-4 py-3 text-sm text-surface-500">
                      {formatDate(task.updatedAt, 'short')}
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onTaskClick(task.id)
                        }}
                        className="p-1 rounded hover:bg-surface-200 dark:hover:bg-surface-600 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={showConfirmDelete}
        title="Delete Tasks"
        message={`Are you sure you want to delete ${visibleSelectedIds.size} task${visibleSelectedIds.size !== 1 ? 's' : ''}? This cannot be undone.`}
        confirmLabel={`Delete ${visibleSelectedIds.size} Task${visibleSelectedIds.size !== 1 ? 's' : ''}`}
        onConfirm={async () => {
          await onBulkDelete?.(Array.from(visibleSelectedIds))
          clearSelection()
          setShowConfirmDelete(false)
        }}
        onCancel={() => setShowConfirmDelete(false)}
      />
    </div>
  )
}
