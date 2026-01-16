// AgentPM Database Service
// Supabase CRUD operations for AgentPM entities

import { supabase } from '../supabase/client'
import type {
  Project,
  AgentPersona,
  Task,
  AgentAction,
  Review,
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
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
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

  const { data, error } = await supabase
    .from('tasks')
    .insert(toSnakeCaseKeys(taskWithHistory as Record<string, unknown>))
    .select()
    .single()

  if (error) throw error
  return toCamelCaseKeys<Task>(data)
}

export async function updateTask(id: string, updates: UpdateEntity<Task>): Promise<Task> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('tasks')
    .update(toSnakeCaseKeys(updates as Record<string, unknown>))
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
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
