// Task List - Filterable list of tasks

import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import {
  Search,
  Filter,
  ListTodo,
} from 'lucide-react'
import type { Task, TaskStatus, TaskPriority } from '@/types/agentpm'
import { TaskCard } from './TaskCard'

interface TaskListProps {
  tasks: Task[]
  agents?: Map<string, string> // agentId -> agentName
  selectedTaskId?: string | null
  onSelectTask?: (taskId: string) => void
  onCreateTask?: () => void
  isLoading?: boolean
}

type SortField = 'created' | 'updated' | 'priority' | 'due'
type SortDirection = 'asc' | 'desc'

const statusOptions: { value: TaskStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Status' },
  { value: 'pending', label: 'Pending' },
  { value: 'queued', label: 'Queued' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'review', label: 'Review' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
]

const priorityOptions: { value: TaskPriority | 'all'; label: string }[] = [
  { value: 'all', label: 'All Priority' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

const priorityOrder: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

export function TaskList({
  tasks,
  agents,
  selectedTaskId,
  onSelectTask,
  onCreateTask,
  isLoading,
}: TaskListProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'all'>('all')
  const [sortField, setSortField] = useState<SortField>('created')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [showFilters, setShowFilters] = useState(false)

  // Filter tasks
  const filteredTasks = tasks.filter((task) => {
    // Search
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      if (
        !task.title.toLowerCase().includes(query) &&
        !task.description?.toLowerCase().includes(query)
      ) {
        return false
      }
    }

    // Status filter
    if (statusFilter !== 'all' && task.status !== statusFilter) {
      return false
    }

    // Priority filter
    if (priorityFilter !== 'all' && task.priority !== priorityFilter) {
      return false
    }

    return true
  })

  // Sort tasks
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    let comparison = 0

    switch (sortField) {
      case 'created':
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        break
      case 'updated':
        comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
        break
      case 'priority':
        comparison = priorityOrder[a.priority] - priorityOrder[b.priority]
        break
      case 'due':
        const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Infinity
        const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Infinity
        comparison = aDue - bDue
        break
    }

    return sortDirection === 'asc' ? comparison : -comparison
  })

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-surface-200 dark:border-surface-700">
        {/* Search */}
        <div className="relative mb-3">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400"
          />
          <input
            type="text"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        {/* Filter Toggle */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              showFilters || statusFilter !== 'all' || priorityFilter !== 'all'
                ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                : 'hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-600 dark:text-surface-400'
            }`}
          >
            <Filter size={16} />
            Filters
            {(statusFilter !== 'all' || priorityFilter !== 'all') && (
              <span className="w-2 h-2 rounded-full bg-primary-500" />
            )}
          </button>

          <div className="flex items-center gap-2 text-sm text-surface-500">
            <span>{sortedTasks.length} tasks</span>
          </div>
        </div>

        {/* Filter Options */}
        {showFilters && (
          <div className="mt-3 p-3 rounded-lg bg-surface-50 dark:bg-surface-900/50 space-y-3">
            <div className="flex items-center gap-3">
              <label className="text-sm text-surface-600 dark:text-surface-400 w-16">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as TaskStatus | 'all')}
                className="flex-1 px-3 py-1.5 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-sm"
              >
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-sm text-surface-600 dark:text-surface-400 w-16">Priority</label>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value as TaskPriority | 'all')}
                className="flex-1 px-3 py-1.5 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-sm"
              >
                {priorityOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-sm text-surface-600 dark:text-surface-400 w-16">Sort by</label>
              <div className="flex gap-1">
                {(['created', 'updated', 'priority', 'due'] as SortField[]).map((field) => (
                  <button
                    key={field}
                    onClick={() => toggleSort(field)}
                    className={`px-2 py-1 rounded text-xs capitalize transition-colors ${
                      sortField === field
                        ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                        : 'hover:bg-surface-200 dark:hover:bg-surface-700'
                    }`}
                  >
                    {field}
                    {sortField === field && (
                      <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full" />
          </div>
        ) : sortedTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-surface-500">
            <ListTodo size={32} className="mb-2 opacity-50" />
            <p className="text-sm">
              {tasks.length === 0 ? 'No tasks yet' : 'No tasks match filters'}
            </p>
            {tasks.length === 0 && onCreateTask && (
              <button
                onClick={onCreateTask}
                className="mt-2 text-sm text-primary-600 dark:text-primary-400 hover:underline"
              >
                Create your first task
              </button>
            )}
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {sortedTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                agentName={task.assignedTo ? agents?.get(task.assignedTo) : undefined}
                selected={selectedTaskId === task.id}
                onClick={onSelectTask}
              />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
