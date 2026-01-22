// Task Dependencies - Show and manage task dependencies

import { useState, useEffect } from 'react'
import {
  Link2,
  Plus,
  X,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Clock,
} from 'lucide-react'
import type { Task, TaskDependency, DependencyType } from '@/types/agentpm'
import * as db from '@/services/agentpm/database'

interface TaskDependenciesProps {
  task: Task
  allTasks: Task[]
  accountId: string
  userId: string
  onDependencyChange?: () => void
}

const DEPENDENCY_TYPE_LABELS: Record<DependencyType, { label: string; description: string }> = {
  FS: { label: 'Finish-to-Start', description: 'This task can start after the blocker finishes' },
  SS: { label: 'Start-to-Start', description: 'This task can start after the blocker starts' },
  FF: { label: 'Finish-to-Finish', description: 'This task can finish after the blocker finishes' },
  SF: { label: 'Start-to-Finish', description: 'This task can finish after the blocker starts' },
}

export function TaskDependencies({
  task,
  allTasks,
  accountId,
  userId,
  onDependencyChange,
}: TaskDependenciesProps) {
  const [dependencies, setDependencies] = useState<TaskDependency[]>([])
  const [dependents, setDependents] = useState<TaskDependency[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAddingDep, setIsAddingDep] = useState(false)
  const [newDepTaskId, setNewDepTaskId] = useState('')
  const [newDepType, setNewDepType] = useState<DependencyType>('FS')
  const [error, setError] = useState<string | null>(null)

  // Fetch dependencies
  useEffect(() => {
    async function loadDependencies() {
      setIsLoading(true)
      try {
        const [deps, depts] = await Promise.all([
          db.fetchTaskDependencies(task.id),
          db.fetchTaskDependents(task.id),
        ])
        setDependencies(deps)
        setDependents(depts)
      } catch (err) {
        console.error('Failed to load dependencies:', err)
      } finally {
        setIsLoading(false)
      }
    }
    loadDependencies()
  }, [task.id])

  // Get task by ID
  const getTask = (id: string) => allTasks.find((t) => t.id === id)

  // Get status indicator for a task
  const getStatusIndicator = (t: Task | undefined) => {
    if (!t) return null
    switch (t.status) {
      case 'completed':
        return <CheckCircle2 size={14} className="text-green-500" />
      case 'in_progress':
        return <Clock size={14} className="text-blue-500" />
      case 'failed':
        return <AlertCircle size={14} className="text-red-500" />
      default:
        return <Clock size={14} className="text-surface-400" />
    }
  }

  // Check if task is blocked (has incomplete dependencies)
  const isBlocked = dependencies.some((dep) => {
    const blockerTask = getTask(dep.dependsOnTaskId)
    return blockerTask && !['completed', 'cancelled'].includes(blockerTask.status)
  })

  // Add dependency
  const handleAddDependency = async () => {
    if (!newDepTaskId) return
    setError(null)

    try {
      await db.createTaskDependency({
        accountId,
        taskId: task.id,
        dependsOnTaskId: newDepTaskId,
        dependencyType: newDepType,
        createdBy: userId,
        createdByType: 'user',
      })

      // Refresh
      const deps = await db.fetchTaskDependencies(task.id)
      setDependencies(deps)
      setIsAddingDep(false)
      setNewDepTaskId('')
      setNewDepType('FS')
      onDependencyChange?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add dependency')
    }
  }

  // Remove dependency
  const handleRemoveDependency = async (depId: string) => {
    try {
      await db.deleteTaskDependency(depId)
      setDependencies((prev) => prev.filter((d) => d.id !== depId))
      onDependencyChange?.()
    } catch (err) {
      console.error('Failed to remove dependency:', err)
    }
  }

  // Available tasks to depend on (exclude self, existing dependencies, and dependents to prevent cycles)
  const availableTasks = allTasks.filter((t) => {
    if (t.id === task.id) return false
    if (dependencies.some((d) => d.dependsOnTaskId === t.id)) return false
    if (dependents.some((d) => d.taskId === t.id)) return false // Would create cycle
    return true
  })

  if (isLoading) {
    return (
      <div className="p-4 text-center text-surface-500">
        <div className="animate-spin w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full mx-auto" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Blocked Warning */}
      {isBlocked && (
        <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-yellow-700 dark:text-yellow-400">
          <AlertCircle size={18} />
          <span className="text-sm font-medium">
            This task is blocked by incomplete dependencies
          </span>
        </div>
      )}

      {/* Dependencies (Blockers) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-surface-700 dark:text-surface-300 flex items-center gap-2">
            <Link2 size={16} />
            Blocked By ({dependencies.length})
          </h4>
          <button
            onClick={() => setIsAddingDep(true)}
            className="flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
          >
            <Plus size={14} />
            Add Blocker
          </button>
        </div>

        {dependencies.length === 0 && !isAddingDep ? (
          <p className="text-sm text-surface-500 py-2">No dependencies</p>
        ) : (
          <div className="space-y-2">
            {dependencies.map((dep) => {
              const blockerTask = getTask(dep.dependsOnTaskId)
              const isComplete = blockerTask?.status === 'completed'

              return (
                <div
                  key={dep.id}
                  className={`flex items-center justify-between p-2 rounded-lg border ${
                    isComplete
                      ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
                      : 'bg-surface-50 dark:bg-surface-800 border-surface-200 dark:border-surface-700'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {getStatusIndicator(blockerTask)}
                    <span className="text-sm text-surface-900 dark:text-surface-100 truncate">
                      {blockerTask?.title || 'Unknown task'}
                    </span>
                    <span className="text-xs text-surface-500 px-1.5 py-0.5 bg-surface-200 dark:bg-surface-700 rounded">
                      {dep.dependencyType}
                    </span>
                    {dep.lagDays && dep.lagDays !== 0 && (
                      <span className="text-xs text-surface-500">
                        {dep.lagDays > 0 ? `+${dep.lagDays}d` : `${dep.lagDays}d`}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemoveDependency(dep.id)}
                    className="p-1 rounded hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-400 hover:text-red-500"
                  >
                    <X size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Add Dependency Form */}
        {isAddingDep && (
          <div className="mt-2 p-3 bg-surface-50 dark:bg-surface-800 rounded-lg border border-surface-200 dark:border-surface-700">
            {error && (
              <div className="mb-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-600 dark:text-red-400 text-sm">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <select
                value={newDepTaskId}
                onChange={(e) => setNewDepTaskId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Select a task...</option>
                {availableTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <select
                  value={newDepType}
                  onChange={(e) => setNewDepType(e.target.value as DependencyType)}
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {Object.entries(DEPENDENCY_TYPE_LABELS).map(([type, { label }]) => (
                    <option key={type} value={type}>
                      {type} - {label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-surface-500">
                {DEPENDENCY_TYPE_LABELS[newDepType].description}
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setIsAddingDep(false)
                    setNewDepTaskId('')
                    setError(null)
                  }}
                  className="px-3 py-1.5 text-sm text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddDependency}
                  disabled={!newDepTaskId}
                  className="px-3 py-1.5 text-sm bg-primary-600 hover:bg-primary-700 disabled:bg-surface-300 dark:disabled:bg-surface-600 text-white rounded-lg"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Dependents (Tasks blocked by this) */}
      {dependents.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-surface-700 dark:text-surface-300 flex items-center gap-2 mb-2">
            <ArrowRight size={16} />
            Blocks ({dependents.length})
          </h4>
          <div className="space-y-2">
            {dependents.map((dep) => {
              const blockedTask = getTask(dep.taskId)
              return (
                <div
                  key={dep.id}
                  className="flex items-center gap-2 p-2 rounded-lg bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700"
                >
                  {getStatusIndicator(blockedTask)}
                  <span className="text-sm text-surface-900 dark:text-surface-100 truncate">
                    {blockedTask?.title || 'Unknown task'}
                  </span>
                  <span className="text-xs text-surface-500 px-1.5 py-0.5 bg-surface-200 dark:bg-surface-700 rounded">
                    {dep.dependencyType}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
