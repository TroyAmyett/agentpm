// AgentPM Database Service
// Supabase CRUD operations for AgentPM entities

import { supabase } from '../supabase/client'
import type {
  Project,
  AgentPersona,
  Task,
  AgentAction,
  Review,
  Milestone,
  TaskDependency,
  KnowledgeEntry,
  ProjectLinkedItem,
  TimeEntry,
  CreateEntity,
  UpdateEntity,
} from '@/types/agentpm'

// =============================================================================
// HELPER: Convert camelCase to snake_case for database
// =============================================================================

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

function toSnakeCaseKeys<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined) {
      result[toSnakeCase(key)] = obj[key]
    }
  }
  return result
}

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
}

function toCamelCaseKeys<T>(obj: Record<string, unknown>): T {
  const result: Record<string, unknown> = {}
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[toCamelCase(key)] = obj[key]
    }
  }
  return result as T
}

// =============================================================================
// PROJECTS
// =============================================================================

export async function fetchProjects(accountId: string): Promise<Project[]> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('account_id', accountId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []).map((row) => toCamelCaseKeys<Project>(row))
}

export async function fetchProject(id: string): Promise<Project | null> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return toCamelCaseKeys<Project>(data)
}

export async function createProject(project: Omit<CreateEntity<Project>, 'stats'>): Promise<Project> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('projects')
    .insert(toSnakeCaseKeys(project as Record<string, unknown>))
    .select()
    .single()

  if (error) throw error
  return toCamelCaseKeys<Project>(data)
}

export async function updateProject(id: string, updates: UpdateEntity<Project>): Promise<Project> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('projects')
    .update(toSnakeCaseKeys(updates as Record<string, unknown>))
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return toCamelCaseKeys<Project>(data)
}

export async function deleteProject(id: string, deletedBy: string, deletedByType: 'user' | 'agent'): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')

  const { error } = await supabase
    .from('projects')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: deletedBy,
      deleted_by_type: deletedByType,
    })
    .eq('id', id)

  if (error) throw error
}

// =============================================================================
// AGENT PERSONAS
// =============================================================================

export async function fetchAgentPersonas(accountId: string): Promise<AgentPersona[]> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('agent_personas')
    .select('*')
    .eq('account_id', accountId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return (data || []).map((row) => toCamelCaseKeys<AgentPersona>(row))
}

export async function fetchAgentPersona(id: string): Promise<AgentPersona | null> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('agent_personas')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return toCamelCaseKeys<AgentPersona>(data)
}

export async function createAgentPersona(agent: Omit<CreateEntity<AgentPersona>, 'stats'>): Promise<AgentPersona> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('agent_personas')
    .insert(toSnakeCaseKeys(agent as Record<string, unknown>))
    .select()
    .single()

  if (error) throw error
  return toCamelCaseKeys<AgentPersona>(data)
}

export async function updateAgentPersona(id: string, updates: UpdateEntity<AgentPersona>): Promise<AgentPersona> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('agent_personas')
    .update(toSnakeCaseKeys(updates as Record<string, unknown>))
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return toCamelCaseKeys<AgentPersona>(data)
}

export async function deleteAgentPersona(id: string, deletedBy: string, deletedByType: 'user' | 'agent'): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')

  const { error } = await supabase
    .from('agent_personas')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: deletedBy,
      deleted_by_type: deletedByType,
    })
    .eq('id', id)

  if (error) throw error
}

// =============================================================================
// TASKS
// =============================================================================

export async function fetchTasks(accountId: string, projectId?: string): Promise<Task[]> {
  if (!supabase) throw new Error('Supabase not configured')

  let query = supabase
    .from('tasks')
    .select('*')
    .eq('account_id', accountId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data, error } = await query

  if (error) throw error
  return (data || []).map((row) => toCamelCaseKeys<Task>(row))
}

export async function fetchTask(id: string): Promise<Task | null> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return toCamelCaseKeys<Task>(data)
}

export async function fetchQueuedTasks(accountId: string): Promise<Task[]> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('account_id', accountId)
    .eq('status', 'queued')
    .eq('assigned_to_type', 'agent')
    .is('deleted_at', null)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data || []).map((row) => toCamelCaseKeys<Task>(row))
}

export async function createTask(task: Omit<CreateEntity<Task>, 'statusHistory'>): Promise<Task> {
  if (!supabase) throw new Error('Supabase not configured')

  const taskWithHistory = {
    ...task,
    statusHistory: [{
      status: task.status || 'pending',
      changedAt: new Date().toISOString(),
      changedBy: task.createdBy,
      changedByType: task.createdByType,
    }],
  }

  const insertData = toSnakeCaseKeys(taskWithHistory as Record<string, unknown>)
  console.log('[DB] Creating task with columns:', Object.keys(insertData).join(', '))

  const { data, error } = await supabase
    .from('tasks')
    .insert(insertData)
    .select()
    .single()

  if (error) {
    console.error('[DB] Task creation failed:', error.message, error.code, error.details, error.hint)
    throw new Error(`Task creation failed: ${error.message}`)
  }
  return toCamelCaseKeys<Task>(data)
}

export async function updateTask(id: string, updates: UpdateEntity<Task>): Promise<Task> {
  if (!supabase) throw new Error('Supabase not configured')

  const updateData = toSnakeCaseKeys(updates as Record<string, unknown>)
  console.log('[DB] Updating task', id, 'with columns:', Object.keys(updateData).join(', '))

  const { data, error } = await supabase
    .from('tasks')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[DB] Task update failed:', error.message, error.code, error.details, error.hint)
    throw new Error(`Task update failed: ${error.message}`)
  }
  return toCamelCaseKeys<Task>(data)
}

export async function updateTaskStatus(
  id: string,
  status: Task['status'],
  changedBy: string,
  changedByType: 'user' | 'agent',
  note?: string
): Promise<Task> {
  if (!supabase) throw new Error('Supabase not configured')

  // Fetch current task to append to status history
  const { data: currentTask, error: fetchError } = await supabase
    .from('tasks')
    .select('status_history, status, started_at')
    .eq('id', id)
    .single()

  if (fetchError) throw fetchError

  const statusHistory = currentTask.status_history || []
  statusHistory.push({
    status,
    changedAt: new Date().toISOString(),
    changedBy,
    changedByType,
    note,
  })

  const updates: Record<string, unknown> = {
    status,
    status_history: statusHistory,
    updated_by: changedBy,
    updated_by_type: changedByType,
  }

  // Set timestamps based on status
  if (status === 'in_progress' && !currentTask.started_at) {
    updates.started_at = new Date().toISOString()
  }
  if (status === 'completed') {
    updates.completed_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return toCamelCaseKeys<Task>(data)
}

export async function deleteTask(id: string, deletedBy: string, deletedByType: 'user' | 'agent'): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')

  const { error } = await supabase
    .from('tasks')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: deletedBy,
      deleted_by_type: deletedByType,
    })
    .eq('id', id)

  if (error) throw error
}

// =============================================================================
// AGENT ACTIONS
// =============================================================================

export async function fetchAgentActions(agentId: string, limit = 50): Promise<AgentAction[]> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('agent_actions')
    .select('*')
    .eq('agent_id', agentId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data || []).map((row) => toCamelCaseKeys<AgentAction>(row))
}

export async function fetchTaskActions(taskId: string): Promise<AgentAction[]> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('agent_actions')
    .select('*')
    .eq('task_id', taskId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data || []).map((row) => toCamelCaseKeys<AgentAction>(row))
}

export async function createAgentAction(action: CreateEntity<AgentAction>): Promise<AgentAction> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('agent_actions')
    .insert(toSnakeCaseKeys(action as Record<string, unknown>))
    .select()
    .single()

  if (error) throw error
  return toCamelCaseKeys<AgentAction>(data)
}

// =============================================================================
// REVIEWS
// =============================================================================

export async function fetchPendingReviews(accountId: string): Promise<Review[]> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('account_id', accountId)
    .eq('status', 'pending')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data || []).map((row) => toCamelCaseKeys<Review>(row))
}

export async function createReview(review: CreateEntity<Review>): Promise<Review> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('reviews')
    .insert(toSnakeCaseKeys(review as Record<string, unknown>))
    .select()
    .single()

  if (error) throw error
  return toCamelCaseKeys<Review>(data)
}

export async function updateReview(id: string, updates: UpdateEntity<Review>): Promise<Review> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('reviews')
    .update(toSnakeCaseKeys(updates as Record<string, unknown>))
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return toCamelCaseKeys<Review>(data)
}

// =============================================================================
// MILESTONES
// =============================================================================

export async function fetchMilestones(projectId: string): Promise<Milestone[]> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('milestones')
    .select('*')
    .eq('project_id', projectId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return (data || []).map((row) => toCamelCaseKeys<Milestone>(row))
}

export async function createMilestone(milestone: CreateEntity<Milestone>): Promise<Milestone> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('milestones')
    .insert(toSnakeCaseKeys(milestone as Record<string, unknown>))
    .select()
    .single()

  if (error) throw error
  return toCamelCaseKeys<Milestone>(data)
}

export async function updateMilestone(id: string, updates: UpdateEntity<Milestone>): Promise<Milestone> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('milestones')
    .update(toSnakeCaseKeys(updates as Record<string, unknown>))
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return toCamelCaseKeys<Milestone>(data)
}

export async function deleteMilestone(id: string, deletedBy: string, deletedByType: 'user' | 'agent'): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')

  const { error } = await supabase
    .from('milestones')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: deletedBy,
      deleted_by_type: deletedByType,
    })
    .eq('id', id)

  if (error) throw error
}

// =============================================================================
// TASK DEPENDENCIES
// =============================================================================

export async function fetchTaskDependencies(taskId: string): Promise<TaskDependency[]> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('task_dependencies')
    .select('*')
    .eq('task_id', taskId)

  if (error) throw error
  return (data || []).map((row) => toCamelCaseKeys<TaskDependency>(row))
}

export async function fetchTaskDependents(taskId: string): Promise<TaskDependency[]> {
  if (!supabase) throw new Error('Supabase not configured')

  // Tasks that depend on this task
  const { data, error } = await supabase
    .from('task_dependencies')
    .select('*')
    .eq('depends_on_task_id', taskId)

  if (error) throw error
  return (data || []).map((row) => toCamelCaseKeys<TaskDependency>(row))
}

export async function createTaskDependency(dependency: Omit<TaskDependency, 'id' | 'createdAt'>): Promise<TaskDependency> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('task_dependencies')
    .insert(toSnakeCaseKeys(dependency as Record<string, unknown>))
    .select()
    .single()

  if (error) {
    // Check for circular dependency error
    if (error.message?.includes('Circular dependency')) {
      throw new Error('Cannot create dependency: this would create a circular dependency')
    }
    throw error
  }
  return toCamelCaseKeys<TaskDependency>(data)
}

export async function deleteTaskDependency(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')

  const { error } = await supabase
    .from('task_dependencies')
    .delete()
    .eq('id', id)

  if (error) throw error
}

/**
 * Fetch all task dependencies for an account and compute which tasks are blocked
 * Returns a map of taskId -> number of incomplete blockers
 */
export async function fetchBlockedTasks(_accountId: string, tasks: Task[]): Promise<Map<string, number>> {
  if (!supabase) throw new Error('Supabase not configured')

  // Create a set of completed/cancelled task IDs (these don't block)
  const completedTaskIds = new Set(
    tasks
      .filter((t) => t.status === 'completed' || t.status === 'cancelled')
      .map((t) => t.id)
  )

  // Get all task IDs for this account
  const taskIds = tasks.map((t) => t.id)

  // Fetch all dependencies where the task is in our list
  const { data, error } = await supabase
    .from('task_dependencies')
    .select('task_id, depends_on_task_id')
    .in('task_id', taskIds)

  if (error) throw error

  // Count incomplete blockers for each task
  const blockedMap = new Map<string, number>()
  for (const dep of data || []) {
    // If the blocker is not completed, count it
    if (!completedTaskIds.has(dep.depends_on_task_id)) {
      const current = blockedMap.get(dep.task_id) || 0
      blockedMap.set(dep.task_id, current + 1)
    }
  }

  return blockedMap
}

// =============================================================================
// KNOWLEDGE ENTRIES
// =============================================================================

export async function fetchKnowledgeEntries(projectId: string): Promise<KnowledgeEntry[]> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('knowledge_entries')
    .select('*')
    .eq('project_id', projectId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []).map((row) => toCamelCaseKeys<KnowledgeEntry>(row))
}

export async function createKnowledgeEntry(entry: CreateEntity<KnowledgeEntry>): Promise<KnowledgeEntry> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('knowledge_entries')
    .insert(toSnakeCaseKeys(entry as Record<string, unknown>))
    .select()
    .single()

  if (error) throw error
  return toCamelCaseKeys<KnowledgeEntry>(data)
}

export async function updateKnowledgeEntry(id: string, updates: UpdateEntity<KnowledgeEntry>): Promise<KnowledgeEntry> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('knowledge_entries')
    .update(toSnakeCaseKeys(updates as Record<string, unknown>))
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return toCamelCaseKeys<KnowledgeEntry>(data)
}

export async function deleteKnowledgeEntry(id: string, deletedBy: string, deletedByType: 'user' | 'agent'): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')

  const { error } = await supabase
    .from('knowledge_entries')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: deletedBy,
      deleted_by_type: deletedByType,
    })
    .eq('id', id)

  if (error) throw error
}

// =============================================================================
// PROJECT LINKED ITEMS
// =============================================================================

export async function fetchProjectLinkedItems(projectId: string): Promise<ProjectLinkedItem[]> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('project_linked_items')
    .select('*')
    .eq('project_id', projectId)

  if (error) throw error
  return (data || []).map((row) => toCamelCaseKeys<ProjectLinkedItem>(row))
}

export async function linkItemToProject(
  accountId: string,
  projectId: string,
  itemType: 'folder' | 'note',
  itemId: string,
  addedBy: string,
  addedByType: 'user' | 'agent' = 'user'
): Promise<ProjectLinkedItem> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('project_linked_items')
    .insert({
      account_id: accountId,
      project_id: projectId,
      item_type: itemType,
      item_id: itemId,
      added_by: addedBy,
      added_by_type: addedByType,
    })
    .select()
    .single()

  if (error) throw error
  return toCamelCaseKeys<ProjectLinkedItem>(data)
}

export async function unlinkItemFromProject(projectId: string, itemType: 'folder' | 'note', itemId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')

  const { error } = await supabase
    .from('project_linked_items')
    .delete()
    .eq('project_id', projectId)
    .eq('item_type', itemType)
    .eq('item_id', itemId)

  if (error) throw error
}

// =============================================================================
// TIME ENTRIES
// =============================================================================

export async function fetchTimeEntries(taskId: string): Promise<TimeEntry[]> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('time_entries')
    .select('*')
    .eq('task_id', taskId)
    .order('entry_date', { ascending: false })

  if (error) throw error
  return (data || []).map((row) => toCamelCaseKeys<TimeEntry>(row))
}

export async function createTimeEntry(entry: Omit<TimeEntry, 'id' | 'createdAt'>): Promise<TimeEntry> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('time_entries')
    .insert(toSnakeCaseKeys(entry as Record<string, unknown>))
    .select()
    .single()

  if (error) throw error
  return toCamelCaseKeys<TimeEntry>(data)
}

export async function deleteTimeEntry(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')

  const { error } = await supabase
    .from('time_entries')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// =============================================================================
// REALTIME SUBSCRIPTIONS
// =============================================================================

export function subscribeToTasks(
  accountId: string,
  onInsert: (task: Task) => void,
  onUpdate: (task: Task) => void,
  onDelete: (id: string) => void
) {
  if (!supabase) return () => {}

  const channel = supabase
    .channel(`tasks:${accountId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'tasks',
        filter: `account_id=eq.${accountId}`,
      },
      (payload) => onInsert(toCamelCaseKeys<Task>(payload.new))
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'tasks',
        filter: `account_id=eq.${accountId}`,
      },
      (payload) => {
        if (payload.new.deleted_at) {
          onDelete(payload.new.id)
        } else {
          onUpdate(toCamelCaseKeys<Task>(payload.new))
        }
      }
    )
    .subscribe()

  return () => {
    channel.unsubscribe()
  }
}

export function subscribeToAgentPersonas(
  accountId: string,
  onInsert: (agent: AgentPersona) => void,
  onUpdate: (agent: AgentPersona) => void,
  onDelete: (id: string) => void
) {
  if (!supabase) return () => {}

  const channel = supabase
    .channel(`agent_personas:${accountId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'agent_personas',
        filter: `account_id=eq.${accountId}`,
      },
      (payload) => onInsert(toCamelCaseKeys<AgentPersona>(payload.new))
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'agent_personas',
        filter: `account_id=eq.${accountId}`,
      },
      (payload) => {
        if (payload.new.deleted_at) {
          onDelete(payload.new.id)
        } else {
          onUpdate(toCamelCaseKeys<AgentPersona>(payload.new))
        }
      }
    )
    .subscribe()

  return () => {
    channel.unsubscribe()
  }
}

export function subscribeToReviews(
  accountId: string,
  onInsert: (review: Review) => void,
  onUpdate: (review: Review) => void
) {
  if (!supabase) return () => {}

  const channel = supabase
    .channel(`reviews:${accountId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'reviews',
        filter: `account_id=eq.${accountId}`,
      },
      (payload) => onInsert(toCamelCaseKeys<Review>(payload.new))
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'reviews',
        filter: `account_id=eq.${accountId}`,
      },
      (payload) => onUpdate(toCamelCaseKeys<Review>(payload.new))
    )
    .subscribe()

  return () => {
    channel.unsubscribe()
  }
}
