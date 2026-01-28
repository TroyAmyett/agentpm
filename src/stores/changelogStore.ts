// Changelog Store
// Manages changelog entries, unread counts, and read status

import { create } from 'zustand'
import { supabase } from '@/services/supabase/client'

export type ChangelogProduct = 'agentpm' | 'radar' | 'canvas' | 'leadgen' | 'all'

export interface ChangelogEntry {
  id: string
  product: ChangelogProduct
  title: string
  description?: string
  commitType: string
  commitHash?: string
  commitDate: string
  isHighlight: boolean
  createdAt: string
  isRead: boolean
}

interface ChangelogState {
  entries: ChangelogEntry[]
  unreadCount: number
  unreadHighlights: ChangelogEntry[]
  isLoading: boolean
  isDrawerOpen: boolean
  isWhatsNewOpen: boolean
  error: string | null
  product: ChangelogProduct | null  // Filter by product, null = show all

  // Actions
  setProduct: (product: ChangelogProduct | null) => void
  fetchEntries: (userId: string) => Promise<void>
  fetchUnreadCount: (userId: string) => Promise<void>
  fetchUnreadHighlights: (userId: string) => Promise<void>
  markAsRead: (userId: string, entryIds: string[]) => Promise<void>
  markAllAsRead: (userId: string) => Promise<void>
  openDrawer: () => void
  closeDrawer: () => void
  openWhatsNew: () => void
  closeWhatsNew: () => void
  dismissHighlights: (userId: string) => Promise<void>
  clearError: () => void
}

export const useChangelogStore = create<ChangelogState>((set, get) => ({
  entries: [],
  unreadCount: 0,
  unreadHighlights: [],
  isLoading: false,
  isDrawerOpen: false,
  isWhatsNewOpen: false,
  error: null,
  product: 'agentpm',  // Default to current app

  setProduct: (product) => {
    set({ product })
  },

  fetchEntries: async (userId: string) => {
    if (!supabase) {
      set({ entries: [], isLoading: false })
      return
    }

    const { product } = get()
    set({ isLoading: true, error: null })

    try {
      const { data, error } = await supabase.rpc('get_changelog_entries', {
        p_user_id: userId,
        p_product: product,
        p_limit: 50,
        p_offset: 0,
      })

      if (error) throw error

      const entries: ChangelogEntry[] = (data || []).map(mapDbRowToEntry)
      set({ entries, isLoading: false })
    } catch (err) {
      console.error('Failed to fetch changelog entries:', err)
      set({ error: (err as Error).message, isLoading: false })
    }
  },

  fetchUnreadCount: async (userId: string) => {
    if (!supabase) {
      set({ unreadCount: 0 })
      return
    }

    const { product } = get()

    try {
      const { data, error } = await supabase.rpc('get_unread_changelog_count', {
        p_user_id: userId,
        p_product: product,
      })

      if (error) throw error

      set({ unreadCount: data || 0 })
    } catch (err) {
      console.error('Failed to fetch unread count:', err)
    }
  },

  fetchUnreadHighlights: async (userId: string) => {
    if (!supabase) {
      set({ unreadHighlights: [] })
      return
    }

    const { product } = get()

    try {
      const { data, error } = await supabase.rpc('get_unread_highlights', {
        p_user_id: userId,
        p_product: product,
      })

      if (error) throw error

      const highlights: ChangelogEntry[] = (data || []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        product: row.product as ChangelogProduct,
        title: row.title as string,
        description: row.description as string | undefined,
        commitType: row.commit_type as string,
        commitDate: row.commit_date as string,
        createdAt: row.created_at as string,
        isHighlight: true,
        isRead: false,
      }))

      set({ unreadHighlights: highlights })

      // Auto-open What's New modal if there are highlights
      if (highlights.length > 0) {
        set({ isWhatsNewOpen: true })
      }
    } catch (err) {
      console.error('Failed to fetch unread highlights:', err)
    }
  },

  markAsRead: async (userId: string, entryIds: string[]) => {
    if (!supabase || entryIds.length === 0) return

    try {
      const { error } = await supabase.rpc('mark_changelog_read', {
        p_user_id: userId,
        p_entry_ids: entryIds,
      })

      if (error) throw error

      // Update local state
      const { entries, unreadCount } = get()
      const updatedEntries = entries.map((entry) =>
        entryIds.includes(entry.id) ? { ...entry, isRead: true } : entry
      )
      const newUnread = Math.max(0, unreadCount - entryIds.filter(id =>
        entries.find(e => e.id === id && !e.isRead)
      ).length)

      set({ entries: updatedEntries, unreadCount: newUnread })
    } catch (err) {
      console.error('Failed to mark entries as read:', err)
    }
  },

  markAllAsRead: async (userId: string) => {
    const { entries } = get()
    const unreadIds = entries.filter((e) => !e.isRead).map((e) => e.id)
    await get().markAsRead(userId, unreadIds)
  },

  openDrawer: () => {
    set({ isDrawerOpen: true })
  },

  closeDrawer: () => {
    set({ isDrawerOpen: false })
  },

  openWhatsNew: () => {
    set({ isWhatsNewOpen: true })
  },

  closeWhatsNew: () => {
    set({ isWhatsNewOpen: false })
  },

  dismissHighlights: async (userId: string) => {
    const { unreadHighlights } = get()
    const highlightIds = unreadHighlights.map((h) => h.id)
    await get().markAsRead(userId, highlightIds)
    set({ unreadHighlights: [], isWhatsNewOpen: false })
  },

  clearError: () => set({ error: null }),
}))

// Helper to map database row to TypeScript interface
function mapDbRowToEntry(row: Record<string, unknown>): ChangelogEntry {
  return {
    id: row.id as string,
    product: row.product as ChangelogProduct,
    title: row.title as string,
    description: row.description as string | undefined,
    commitType: row.commit_type as string,
    commitHash: row.commit_hash as string | undefined,
    commitDate: row.commit_date as string,
    isHighlight: (row.is_highlight as boolean) || false,
    createdAt: row.created_at as string,
    isRead: (row.is_read as boolean) || false,
  }
}
