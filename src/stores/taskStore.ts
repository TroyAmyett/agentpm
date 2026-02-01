// Task Store - Zustand store for AgentPM tasks

import { create } from 'zustand'
import type { Task, TaskStatus, TaskPriority, UpdateEntity, TaskDependency } from '@/types/agentpm'
import * as db from '@/services/agentpm/database'
import { isAuthError, handleAuthError } from '@/services/supabase/client'

interface TaskFilters {
  status: TaskStatus | null
  priority: TaskPriority | null
  assignedTo: string | null
  projectId: string | null
}

interface TaskState {
  // State
  tasks: Task[]
  blockedTasks: Map<string, number> // taskId -> number of incomplete blockers
  selectedTaskId: string | null
  isLoading: boolean
  error: string | null
  filters: TaskFilters

  // Actions
  fetchTasks: (accountId: string, projectId?: string) => Promise<void>
  fetchBlockedTasks: (accountId: string) => Promise<void>
  selectTask: (id: string | null) => void
  getTask: (id: string) => Task | undefined
  getSelectedTask: () => Task | null

  createTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'statusHistory'>) => Promise<Task>
  updateTask: (id: string, updates: UpdateEntity<Task>) => Promise<void>
  updateTaskStatus: (id: string, status: TaskStatus, userId: string, note?: string) => Promise<void>
  assignTask: (id: string, assignedTo: string, assignedToType: 'user' | 'agent', userId: string) => Promise<void>
  deleteTask: (id: string, userId: string) => Promise<void>

  // Dependencies
  createTaskDependency: (taskId: string, dependsOnTaskId: string, accountId: string, createdBy: string) => Promise<TaskDependency>
  isTaskBlocked: (taskId: string) => boolean

  // Filters
  setFilter: <K extends keyof TaskFilters>(key: K, value: TaskFilters[K]) => void
  clearFilters: () => void
  getFilteredTasks: () => Task[]

  // Derived data
  getTasksByStatus: (status: TaskStatus) => Task[]
  getTasksByAgent: (agentId: string) => Task[]
  getTasksByProject: (projectId: string) => Task[]
  getPendingReviewTasks: () => Task[]
  getQueuedTasks: () => Task[]

  // Realtime handlers
  handleRemoteTaskChange: (task: Task) => void
  handleRemoteTaskDelete: (id: string) => void

  // Subscription
  subscribeToTasks: (accountId: string) => () => void

  // Clear
  clearTasks: () => void
}

const defaultFilters: TaskFilters = {
  status: null,
  priority: null,
  assignedTo: null,
  projectId: null,
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  blockedTasks: new Map(),
  selectedTaskId: null,
  isLoading: false,
  error: null,
  filters: defaultFilters,

  fetchTasks: async (accountId, projectId) => {
    // Clear tasks immediately to prevent showing stale data from previous account
    set({ tasks: [], blockedTasks: new Map(), isLoading: true, error: null })

    try {
      console.log(`[TaskStore] Fetching tasks for account: ${accountId}`)
      const tasks = await db.fetchTasks(accountId, projectId)
      console.log(`[TaskStore] Fetched ${tasks.length} tasks from database`)
      // Also fetch blocked status
      const blockedTasks = await db.fetchBlockedTasks(accountId, tasks)
      set({ tasks, blockedTasks, isLoading: false })
    } catch (err) {
      // Check if this is an auth error (expired JWT, etc.)
      if (isAuthError(err)) {
        console.warn('[TaskStore] Auth error detected, signing out...')
        await handleAuthError()
        return
      }

      console.error('[TaskStore] Failed to fetch tasks:', err)
      set({
        tasks: [],
        blockedTasks: new Map(),
        error: err instanceof Error ? err.message : 'Failed to fetch tasks',
        isLoading: false,
      })
    }
  },

  fetchBlockedTasks: async (accountId) => {
    const { tasks } = get()
    try {
      const blockedTasks = await db.fetchBlockedTasks(accountId, tasks)
      set({ blockedTasks })
    } catch (err) {
      console.error('Failed to fetch blocked tasks:', err)
    }
  },

  selectTask: (id) => set({ selectedTaskId: id }),

  getTask: (id) => {
    return get().tasks.find((t) => t.id === id)
  },

  getSelectedTask: () => {
    const { tasks, selectedTaskId } = get()
    return tasks.find((t) => t.id === selectedTaskId) || null
  },

  createTask: async (taskData) => {
    const { tasks } = get()

    // Validate accountId - don't allow placeholder IDs
    if (!taskData.accountId || taskData.accountId.startsWith('default-') || taskData.accountId.startsWith('demo-')) {
      throw new Error('Please select a valid account before creating tasks. You may need to sign in or create an account.')
    }

    // Create with initial status history
    const task = await db.createTask({
      ...taskData,
      status: taskData.status || 'pending',
    })

    set({ tasks: [task, ...tasks] })
    return task
  },

  updateTask: async (id, updates) => {
    const { tasks } = get()
    const currentTask = tasks.find((t) => t.id === id)
    if (!currentTask) return

    // Optimistic update
    set({
      tasks: tasks.map((t) =>
        t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t
      ),
    })

    try {
      await db.updateTask(id, updates)
    } catch (err) {
      // Revert on error
      set({ tasks })
      throw err
    }
  },

  updateTaskStatus: async (id, status, userId, note) => {
    const { tasks } = get()
    const currentTask = tasks.find((t) => t.id === id)
    if (!currentTask) return

    // Optimistic update
    const newStatusHistory = [
      ...currentTask.statusHistory,
      {
        status,
        changedAt: new Date().toISOString(),
        changedBy: userId,
        changedByType: 'user' as const,
        note,
      },
    ]

    set({
      tasks: tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              status,
              statusHistory: newStatusHistory,
              updatedAt: new Date().toISOString(),
              ...(status === 'in_progress' && !t.startedAt
                ? { startedAt: new Date().toISOString() }
                : {}),
              ...(status === 'completed' ? { completedAt: new Date().toISOString() } : {}),
            }
          : t
      ),
    })

    try {
      await db.updateTaskStatus(id, status, userId, 'user', note)
    } catch (err) {
      // Revert on error
      set({ tasks })
      throw err
    }
  },

  assignTask: async (id, assignedTo, assignedToType, userId) => {
    await get().updateTask(id, {
      assignedTo,
      assignedToType,
      updatedBy: userId,
      updatedByType: 'user',
    })
  },

  deleteTask: async (id, userId) => {
    const { tasks } = get()

    // Optimistic update
    set({
      tasks: tasks.filter((t) => t.id !== id),
      selectedTaskId: get().selectedTaskId === id ? null : get().selectedTaskId,
    })

    try {
      await db.deleteTask(id, userId, 'user')
    } catch (err) {
      // Revert on error
      set({ tasks })
      throw err
    }
  },

  createTaskDependency: async (taskId, dependsOnTaskId, accountId, createdBy) => {
    const dependency = await db.createTaskDependency({
      accountId,
      taskId,
      dependsOnTaskId,
      dependencyType: 'FS', // Finish-to-Start (most common)
      createdBy,
      createdByType: 'agent',
    })

    // Update blocked tasks map
    const { tasks, blockedTasks } = get()
    const newBlockedTasks = new Map(blockedTasks)
    const currentCount = newBlockedTasks.get(taskId) || 0
    newBlockedTasks.set(taskId, currentCount + 1)
    set({ blockedTasks: newBlockedTasks })

    // Refresh blocked tasks to ensure accuracy
    db.fetchBlockedTasks(accountId, tasks).then((refreshedBlocked) => {
      set({ blockedTasks: refreshedBlocked })
    })

    return dependency
  },

  isTaskBlocked: (taskId) => {
    const { blockedTasks } = get()
    return (blockedTasks.get(taskId) || 0) > 0
  },

  setFilter: (key, value) => {
    set((state) => ({
      filters: { ...state.filters, [key]: value },
    }))
  },

  clearFilters: () => {
    set({ filters: defaultFilters })
  },

  getFilteredTasks: () => {
    const { tasks, filters } = get()
    return tasks.filter((task) => {
      if (filters.status && task.status !== filters.status) return false
      if (filters.priority && task.priority !== filters.priority) return false
      if (filters.assignedTo && task.assignedTo !== filters.assignedTo) return false
      if (filters.projectId && task.projectId !== filters.projectId) return false
      return true
    })
  },

  getTasksByStatus: (status) => {
    return get().tasks.filter((t) => t.status === status)
  },

  getTasksByAgent: (agentId) => {
    return get().tasks.filter((t) => t.assignedTo === agentId && t.assignedToType === 'agent')
  },

  getTasksByProject: (projectId) => {
    return get().tasks.filter((t) => t.projectId === projectId)
  },

  getPendingReviewTasks: () => {
    return get().tasks.filter((t) => t.status === 'review')
  },

  getQueuedTasks: () => {
    return get().tasks.filter((t) => t.status === 'queued')
  },

  handleRemoteTaskChange: (remoteTask) => {
    const prevTask = get().tasks.find((t) => t.id === remoteTask.id)
    const statusChanged = prevTask && prevTask.status !== remoteTask.status
    const taskCompleted = statusChanged && (remoteTask.status === 'completed' || remoteTask.status === 'cancelled')

    set((state) => {
      // If the task has been soft-deleted, remove it from the active list
      if (remoteTask.deletedAt) {
        return {
          tasks: state.tasks.filter((t) => t.id !== remoteTask.id),
          selectedTaskId: state.selectedTaskId === remoteTask.id ? null : state.selectedTaskId,
        }
      }

      const existingIndex = state.tasks.findIndex((t) => t.id === remoteTask.id)
      if (existingIndex >= 0) {
        // Merge remote changes with existing local task to preserve fields
        // that may not be included in partial realtime updates (e.g., input, output)
        const existing = state.tasks[existingIndex]
        const newTasks = [...state.tasks]
        newTasks[existingIndex] = { ...existing, ...remoteTask }
        return { tasks: newTasks }
      } else {
        // Insert new at beginning
        return { tasks: [remoteTask, ...state.tasks] }
      }
    })

    // If a task was completed/cancelled, refresh blocked tasks to unblock dependents
    if (taskCompleted) {
      const { tasks } = get()
      const accountId = remoteTask.accountId
      db.fetchBlockedTasks(accountId, tasks).then((refreshedBlocked) => {
        set({ blockedTasks: refreshedBlocked })
      }).catch((err) => {
        console.error('Failed to refresh blocked tasks:', err)
      })
    }
  },

  handleRemoteTaskDelete: (id) => {
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
      selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId,
    }))
  },

  subscribeToTasks: (accountId) => {
    const { handleRemoteTaskChange, handleRemoteTaskDelete } = get()
    return db.subscribeToTasks(
      accountId,
      handleRemoteTaskChange,
      handleRemoteTaskChange,
      handleRemoteTaskDelete
    )
  },

  clearTasks: () => {
    set({
      tasks: [],
      blockedTasks: new Map(),
      selectedTaskId: null,
      isLoading: false,
      error: null,
      filters: defaultFilters,
    })
  },
}))

// Selectors
export const selectTaskCounts = (state: TaskState) => ({
  total: state.tasks.length,
  pending: state.tasks.filter((t) => t.status === 'pending').length,
  queued: state.tasks.filter((t) => t.status === 'queued').length,
  inProgress: state.tasks.filter((t) => t.status === 'in_progress').length,
  review: state.tasks.filter((t) => t.status === 'review').length,
  completed: state.tasks.filter((t) => t.status === 'completed').length,
  failed: state.tasks.filter((t) => t.status === 'failed').length,
})
