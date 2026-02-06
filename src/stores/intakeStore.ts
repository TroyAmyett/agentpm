// Intake & Notification Store — Zustand store for channel management
// Manages intake channels (inbound task creation) and notification channels (outbound alerts)

import { create } from 'zustand'
import { supabase } from '@/services/supabase/client'
import type {
  IntakeChannel,
  IntakeLogEntry,
  NotificationChannel,
  NotificationLogEntry,
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

interface IntakeState {
  // Intake channels
  intakeChannels: IntakeChannel[]
  intakeLog: IntakeLogEntry[]
  intakeLogTotal: number

  // Notification channels
  notificationChannels: NotificationChannel[]
  notificationLog: NotificationLogEntry[]
  notificationLogTotal: number

  // State
  loading: boolean
  error: string | null

  // ── Intake Channel CRUD ─────────────────────────────────────────────
  fetchIntakeChannels: (accountId: string) => Promise<void>
  createIntakeChannel: (data: Partial<IntakeChannel> & {
    accountId: string
    channelType: IntakeChannel['channelType']
    name: string
  }) => Promise<IntakeChannel | null>
  updateIntakeChannel: (id: string, updates: Partial<IntakeChannel>) => Promise<void>
  deleteIntakeChannel: (id: string) => Promise<void>
  toggleIntakeChannel: (id: string, isActive: boolean) => Promise<void>

  // ── Intake Log ──────────────────────────────────────────────────────
  fetchIntakeLog: (accountId: string, limit?: number, offset?: number) => Promise<void>

  // ── Notification Channel CRUD ───────────────────────────────────────
  fetchNotificationChannels: (accountId: string) => Promise<void>
  createNotificationChannel: (data: Partial<NotificationChannel> & {
    accountId: string
    channelType: NotificationChannel['channelType']
    name: string
  }) => Promise<NotificationChannel | null>
  updateNotificationChannel: (id: string, updates: Partial<NotificationChannel>) => Promise<void>
  deleteNotificationChannel: (id: string) => Promise<void>
  toggleNotificationChannel: (id: string, isActive: boolean) => Promise<void>

  // ── Notification Log ────────────────────────────────────────────────
  fetchNotificationLog: (accountId: string, limit?: number, offset?: number) => Promise<void>

  // ── Helpers ─────────────────────────────────────────────────────────
  generateEmailAddress: (accountId: string) => string
  generateWebhookSlug: () => string
  clearError: () => void
}

// ─── Helper: Generate unique identifiers ────────────────────────────────────

function generateId(length: number = 12): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  const randomValues = new Uint8Array(length)
  crypto.getRandomValues(randomValues)
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length]
  }
  return result
}

// ─── Store ──────────────────────────────────────────────────────────────────

export const useIntakeStore = create<IntakeState>((set, get) => ({
  intakeChannels: [],
  intakeLog: [],
  intakeLogTotal: 0,
  notificationChannels: [],
  notificationLog: [],
  notificationLogTotal: 0,
  loading: false,
  error: null,

  // ════════════════════════════════════════════════════════════════════════
  // INTAKE CHANNELS
  // ════════════════════════════════════════════════════════════════════════

  fetchIntakeChannels: async (accountId: string) => {
    if (!supabase) return
    set({ loading: true, error: null })

    try {
      const { data, error } = await supabase
        .from('intake_channels')
        .select('*')
        .eq('account_id', accountId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (error) throw error
      set({
        intakeChannels: (data || []).map(row => toCamelCaseKeys<IntakeChannel>(row)),
        loading: false,
      })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  createIntakeChannel: async (data) => {
    if (!supabase) return null
    set({ loading: true, error: null })

    try {
      const insertData = toSnakeCaseKeys({
        ...data,
        channelAddress: data.channelAddress || undefined,
        webhookSlug: data.webhookSlug || undefined,
        config: data.config || {},
        autoParse: data.autoParse ?? true,
        autoAssign: data.autoAssign ?? false,
        autoExecute: data.autoExecute ?? false,
        defaultPriority: data.defaultPriority || 'medium',
        defaultStatus: data.defaultStatus || 'pending',
        isActive: true,
        totalTasksCreated: 0,
        createdByType: 'user',
      })

      const { data: result, error } = await supabase
        .from('intake_channels')
        .insert(insertData)
        .select()
        .single()

      if (error) throw error

      const channel = toCamelCaseKeys<IntakeChannel>(result)
      set(state => ({
        intakeChannels: [channel, ...state.intakeChannels],
        loading: false,
      }))
      return channel
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
      return null
    }
  },

  updateIntakeChannel: async (id: string, updates: Partial<IntakeChannel>) => {
    if (!supabase) return
    const prevChannels = get().intakeChannels

    // Optimistic update
    set(state => ({
      intakeChannels: state.intakeChannels.map(ch =>
        ch.id === id ? { ...ch, ...updates } : ch
      ),
    }))

    try {
      const updateData = toSnakeCaseKeys({
        ...updates,
        updatedAt: new Date().toISOString(),
      } as Record<string, unknown>)

      const { error } = await supabase
        .from('intake_channels')
        .update(updateData)
        .eq('id', id)

      if (error) throw error
    } catch (err) {
      set({ intakeChannels: prevChannels, error: (err as Error).message })
    }
  },

  deleteIntakeChannel: async (id: string) => {
    if (!supabase) return

    try {
      const { error } = await supabase
        .from('intake_channels')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)

      if (error) throw error

      set(state => ({
        intakeChannels: state.intakeChannels.filter(ch => ch.id !== id),
      }))
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  toggleIntakeChannel: async (id: string, isActive: boolean) => {
    await get().updateIntakeChannel(id, { isActive } as Partial<IntakeChannel>)
  },

  // ════════════════════════════════════════════════════════════════════════
  // INTAKE LOG
  // ════════════════════════════════════════════════════════════════════════

  fetchIntakeLog: async (accountId: string, limit = 50, offset = 0) => {
    if (!supabase) return

    try {
      const { data, error, count } = await supabase
        .from('intake_log')
        .select('*', { count: 'exact' })
        .eq('account_id', accountId)
        .order('received_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) throw error
      set({
        intakeLog: (data || []).map(row => toCamelCaseKeys<IntakeLogEntry>(row)),
        intakeLogTotal: count || 0,
      })
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  // ════════════════════════════════════════════════════════════════════════
  // NOTIFICATION CHANNELS
  // ════════════════════════════════════════════════════════════════════════

  fetchNotificationChannels: async (accountId: string) => {
    if (!supabase) return
    set({ loading: true, error: null })

    try {
      const { data, error } = await supabase
        .from('notification_channels')
        .select('*')
        .eq('account_id', accountId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (error) throw error
      set({
        notificationChannels: (data || []).map(row => toCamelCaseKeys<NotificationChannel>(row)),
        loading: false,
      })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  createNotificationChannel: async (data) => {
    if (!supabase) return null
    set({ loading: true, error: null })

    try {
      const insertData = toSnakeCaseKeys({
        ...data,
        config: data.config || {},
        notifyOn: data.notifyOn || ['completed', 'failed', 'review'],
        isActive: true,
        totalSent: 0,
        createdByType: undefined, // Not in notification_channels schema
      } as Record<string, unknown>)

      const { data: result, error } = await supabase
        .from('notification_channels')
        .insert(insertData)
        .select()
        .single()

      if (error) throw error

      const channel = toCamelCaseKeys<NotificationChannel>(result)
      set(state => ({
        notificationChannels: [channel, ...state.notificationChannels],
        loading: false,
      }))
      return channel
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
      return null
    }
  },

  updateNotificationChannel: async (id: string, updates: Partial<NotificationChannel>) => {
    if (!supabase) return
    const prevChannels = get().notificationChannels

    // Optimistic update
    set(state => ({
      notificationChannels: state.notificationChannels.map(ch =>
        ch.id === id ? { ...ch, ...updates } : ch
      ),
    }))

    try {
      const updateData = toSnakeCaseKeys({
        ...updates,
        updatedAt: new Date().toISOString(),
      } as Record<string, unknown>)

      const { error } = await supabase
        .from('notification_channels')
        .update(updateData)
        .eq('id', id)

      if (error) throw error
    } catch (err) {
      set({ notificationChannels: prevChannels, error: (err as Error).message })
    }
  },

  deleteNotificationChannel: async (id: string) => {
    if (!supabase) return

    try {
      const { error } = await supabase
        .from('notification_channels')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)

      if (error) throw error

      set(state => ({
        notificationChannels: state.notificationChannels.filter(ch => ch.id !== id),
      }))
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  toggleNotificationChannel: async (id: string, isActive: boolean) => {
    await get().updateNotificationChannel(id, { isActive } as Partial<NotificationChannel>)
  },

  // ════════════════════════════════════════════════════════════════════════
  // NOTIFICATION LOG
  // ════════════════════════════════════════════════════════════════════════

  fetchNotificationLog: async (accountId: string, limit = 50, offset = 0) => {
    if (!supabase) return

    try {
      const { data, error, count } = await supabase
        .from('notification_log')
        .select('*', { count: 'exact' })
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) throw error
      set({
        notificationLog: (data || []).map(row => toCamelCaseKeys<NotificationLogEntry>(row)),
        notificationLogTotal: count || 0,
      })
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  // ════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════════════════════════════════════

  generateEmailAddress: (_accountId: string) => {
    const slug = generateId(8)
    return `tasks+${slug}@inbound.agentpm.app`
  },

  generateWebhookSlug: () => {
    return generateId(16)
  },

  clearError: () => set({ error: null }),
}))
