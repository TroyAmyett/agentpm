// Workflow Store — Zustand store for workflow templates and runs

import { create } from 'zustand'
import { supabase } from '@/services/supabase/client'
import type {
  WorkflowTemplate,
  WorkflowRun,
  MilestoneSchedule,
} from '@/types/agentpm'

// ─── Snake/Camel helpers ────────────────────────────────────────────────────

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

function toSnakeCaseKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined) {
      result[toSnakeCase(key)] = obj[key]
    }
  }
  return result
}

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
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

// ─── Store Interface ────────────────────────────────────────────────────────

interface WorkflowState {
  templates: WorkflowTemplate[]
  runs: WorkflowRun[]
  loading: boolean
  error: string | null

  // Template CRUD
  fetchTemplates: (accountId: string) => Promise<void>
  createTemplate: (data: Partial<WorkflowTemplate> & { accountId: string; name: string }) => Promise<WorkflowTemplate | null>
  updateTemplate: (id: string, updates: Partial<WorkflowTemplate>) => Promise<void>
  deleteTemplate: (id: string) => Promise<void>

  // Run management
  fetchRuns: (accountId: string) => Promise<void>
  updateRunLocally: (runId: string, updates: Partial<WorkflowRun>) => void
  cancelRun: (runId: string) => Promise<void>

  // Schedule management
  updateSchedule: (templateId: string, schedule: MilestoneSchedule | null) => Promise<void>
  toggleSchedule: (templateId: string, active: boolean) => Promise<void>
}

// ─── Store ──────────────────────────────────────────────────────────────────

export const useWorkflowStore = create<WorkflowState>()((set, get) => ({
  templates: [],
  runs: [],
  loading: false,
  error: null,

  // ── Templates ───────────────────────────────────────────────────────────

  fetchTemplates: async (accountId) => {
    if (!supabase) return
    set({ loading: true, error: null })

    try {
      const { data, error } = await supabase
        .from('workflow_templates')
        .select('*')
        .eq('account_id', accountId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (error) throw error
      set({
        templates: (data || []).map((row) => toCamelCaseKeys<WorkflowTemplate>(row)),
        loading: false,
      })
    } catch (err) {
      console.error('[WorkflowStore] fetchTemplates error:', err)
      set({ loading: false, error: err instanceof Error ? err.message : 'Failed to fetch templates' })
    }
  },

  createTemplate: async (data) => {
    if (!supabase) return null
    set({ error: null })

    try {
      const insertData = toSnakeCaseKeys({
        accountId: data.accountId,
        name: data.name,
        description: data.description || null,
        icon: data.icon || null,
        steps: data.steps || [],
        schedule: data.schedule || null,
        nextRunAt: data.nextRunAt || null,
        isScheduleActive: data.isScheduleActive || false,
        projectId: data.projectId || null,
        createdBy: data.createdBy || null,
        createdByType: data.createdByType || 'user',
      } as Record<string, unknown>)

      const { data: row, error } = await supabase
        .from('workflow_templates')
        .insert(insertData)
        .select()
        .single()

      if (error) throw error

      const template = toCamelCaseKeys<WorkflowTemplate>(row)
      set({ templates: [template, ...get().templates] })
      return template
    } catch (err) {
      console.error('[WorkflowStore] createTemplate error:', err)
      set({ error: err instanceof Error ? err.message : 'Failed to create template' })
      return null
    }
  },

  updateTemplate: async (id, updates) => {
    if (!supabase) return

    try {
      const updateData = toSnakeCaseKeys({
        ...updates,
        updatedAt: new Date().toISOString(),
      } as Record<string, unknown>)

      const { error } = await supabase
        .from('workflow_templates')
        .update(updateData)
        .eq('id', id)

      if (error) throw error

      set({
        templates: get().templates.map((t) =>
          t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t
        ),
      })
    } catch (err) {
      console.error('[WorkflowStore] updateTemplate error:', err)
      set({ error: err instanceof Error ? err.message : 'Failed to update template' })
    }
  },

  deleteTemplate: async (id) => {
    if (!supabase) return

    try {
      const { error } = await supabase
        .from('workflow_templates')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)

      if (error) throw error
      set({ templates: get().templates.filter((t) => t.id !== id) })
    } catch (err) {
      console.error('[WorkflowStore] deleteTemplate error:', err)
      set({ error: err instanceof Error ? err.message : 'Failed to delete template' })
    }
  },

  // ── Runs ────────────────────────────────────────────────────────────────

  fetchRuns: async (accountId) => {
    if (!supabase) return

    try {
      const { data, error } = await supabase
        .from('workflow_runs')
        .select('*, workflow_templates!inner(name, icon, steps)')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error

      const runs = (data || []).map((row) => {
        const templateData = row.workflow_templates as Record<string, unknown> | undefined
        const run = toCamelCaseKeys<WorkflowRun>({
          ...row,
          workflow_templates: undefined,
        })

        if (templateData) {
          run.template = {
            name: templateData.name as string,
            icon: templateData.icon as string | undefined,
            steps: templateData.steps as WorkflowTemplate['steps'],
          } as WorkflowTemplate
        }

        return run
      })

      set({ runs })
    } catch (err) {
      console.error('[WorkflowStore] fetchRuns error:', err)
    }
  },

  updateRunLocally: (runId, updates) => {
    set({
      runs: get().runs.map((r) =>
        r.id === runId ? { ...r, ...updates } : r
      ),
    })
  },

  cancelRun: async (runId) => {
    if (!supabase) return

    try {
      const { error } = await supabase
        .from('workflow_runs')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', runId)

      if (error) throw error

      set({
        runs: get().runs.map((r) =>
          r.id === runId ? { ...r, status: 'cancelled' as const } : r
        ),
      })
    } catch (err) {
      console.error('[WorkflowStore] cancelRun error:', err)
    }
  },

  // ── Scheduling ──────────────────────────────────────────────────────────

  updateSchedule: async (templateId, schedule) => {
    if (!supabase) return

    try {
      let nextRunAt: string | null = null

      if (schedule && schedule.type !== 'none') {
        // Calculate next run from the schedule
        const now = new Date()
        nextRunAt = calculateNextRun(schedule, now)
      }

      const { error } = await supabase
        .from('workflow_templates')
        .update({
          schedule: schedule || null,
          next_run_at: nextRunAt,
          is_schedule_active: !!schedule && schedule.type !== 'none',
          updated_at: new Date().toISOString(),
        })
        .eq('id', templateId)

      if (error) throw error

      set({
        templates: get().templates.map((t) =>
          t.id === templateId
            ? {
                ...t,
                schedule: schedule || undefined,
                nextRunAt: nextRunAt || undefined,
                isScheduleActive: !!schedule && schedule.type !== 'none',
              }
            : t
        ),
      })
    } catch (err) {
      console.error('[WorkflowStore] updateSchedule error:', err)
      set({ error: err instanceof Error ? err.message : 'Failed to update schedule' })
    }
  },

  toggleSchedule: async (templateId, active) => {
    if (!supabase) return

    try {
      const template = get().templates.find((t) => t.id === templateId)
      let nextRunAt: string | null = null

      if (active && template?.schedule && template.schedule.type !== 'none') {
        nextRunAt = calculateNextRun(template.schedule, new Date())
      }

      const { error } = await supabase
        .from('workflow_templates')
        .update({
          is_schedule_active: active,
          next_run_at: nextRunAt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', templateId)

      if (error) throw error

      set({
        templates: get().templates.map((t) =>
          t.id === templateId
            ? { ...t, isScheduleActive: active, nextRunAt: nextRunAt || undefined }
            : t
        ),
      })
    } catch (err) {
      console.error('[WorkflowStore] toggleSchedule error:', err)
    }
  },
}))

// ─── Schedule Calculation (mirrors SQL calculate_next_run) ──────────────────

function calculateNextRun(schedule: MilestoneSchedule, from: Date): string | null {
  const hour = schedule.hour ?? 0

  if (schedule.type === 'once') {
    if (schedule.runDate) {
      const runDate = new Date(schedule.runDate)
      runDate.setHours(hour, 0, 0, 0)
      return runDate > from ? runDate.toISOString() : null
    }
    return null
  }

  if (schedule.type === 'daily') {
    const next = new Date(from)
    next.setDate(next.getDate() + 1)
    next.setHours(hour, 0, 0, 0)
    return next.toISOString()
  }

  if (schedule.type === 'weekly') {
    const dayOfWeek = schedule.dayOfWeek ?? 0
    const next = new Date(from)
    const currentDay = next.getDay()
    let daysUntil = dayOfWeek - currentDay
    if (daysUntil < 0 || (daysUntil === 0 && next.getHours() >= hour)) {
      daysUntil += 7
    }
    next.setDate(next.getDate() + daysUntil)
    next.setHours(hour, 0, 0, 0)

    if (schedule.endDate && next > new Date(schedule.endDate)) return null
    return next.toISOString()
  }

  if (schedule.type === 'monthly') {
    const dayOfMonth = schedule.dayOfMonth ?? 1
    const next = new Date(from)
    next.setMonth(next.getMonth() + 1)
    next.setDate(dayOfMonth)
    next.setHours(hour, 0, 0, 0)

    if (next <= from) {
      next.setMonth(next.getMonth() + 1)
    }

    if (schedule.endDate && next > new Date(schedule.endDate)) return null
    return next.toISOString()
  }

  return null
}
