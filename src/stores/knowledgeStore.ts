// Knowledge Store - Zustand store for AgentPM knowledge entries

import { create } from 'zustand'
import type { KnowledgeEntry, UpdateEntity } from '@/types/agentpm'
import * as db from '@/services/agentpm/database'
import { isAuthError, handleAuthError } from '@/services/supabase/client'

interface KnowledgeState {
  // State
  entries: KnowledgeEntry[]
  isLoading: boolean
  error: string | null

  // Actions
  fetchKnowledge: (projectId: string) => Promise<void>
  getKnowledgeByProject: (projectId: string) => KnowledgeEntry[]
  getKnowledgeByType: (projectId: string, type: KnowledgeEntry['knowledgeType']) => KnowledgeEntry[]

  createKnowledge: (entry: Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt'>) => Promise<KnowledgeEntry>
  updateKnowledge: (id: string, updates: UpdateEntity<KnowledgeEntry>) => Promise<void>
  deleteKnowledge: (id: string, userId: string) => Promise<void>

  // Clear
  clearKnowledge: () => void
}

export const useKnowledgeStore = create<KnowledgeState>((set, get) => ({
  entries: [],
  isLoading: false,
  error: null,

  fetchKnowledge: async (projectId) => {
    set({ isLoading: true, error: null })

    try {
      console.log(`[KnowledgeStore] Fetching knowledge for project: ${projectId}`)
      const entries = await db.fetchKnowledgeEntries(projectId)
      console.log(`[KnowledgeStore] Fetched ${entries.length} entries`)

      // Merge with existing entries from other projects
      const existingOther = get().entries.filter(e => e.projectId !== projectId)
      set({ entries: [...existingOther, ...entries], isLoading: false })
    } catch (err) {
      if (isAuthError(err)) {
        console.warn('[KnowledgeStore] Auth error detected, signing out...')
        await handleAuthError()
        return
      }

      console.error('[KnowledgeStore] Failed to fetch knowledge:', err)
      set({
        error: err instanceof Error ? err.message : 'Failed to fetch knowledge',
        isLoading: false,
      })
    }
  },

  getKnowledgeByProject: (projectId) => {
    return get().entries.filter((e) => e.projectId === projectId)
  },

  getKnowledgeByType: (projectId, type) => {
    return get().entries.filter(
      (e) => e.projectId === projectId && e.knowledgeType === type
    )
  },

  createKnowledge: async (entryData) => {
    const { entries } = get()

    const entry = await db.createKnowledgeEntry(entryData)
    set({ entries: [...entries, entry] })
    return entry
  },

  updateKnowledge: async (id, updates) => {
    const { entries } = get()
    const currentEntry = entries.find((e) => e.id === id)
    if (!currentEntry) return

    // Optimistic update
    set({
      entries: entries.map((e) =>
        e.id === id ? { ...e, ...updates, updatedAt: new Date().toISOString() } : e
      ),
    })

    try {
      await db.updateKnowledgeEntry(id, updates)
    } catch (err) {
      // Revert on error
      set({ entries })
      throw err
    }
  },

  deleteKnowledge: async (id, userId) => {
    const { entries } = get()

    // Optimistic update
    set({
      entries: entries.filter((e) => e.id !== id),
    })

    try {
      await db.deleteKnowledgeEntry(id, userId, 'user')
    } catch (err) {
      // Revert on error
      set({ entries })
      throw err
    }
  },

  clearKnowledge: () => {
    set({
      entries: [],
      isLoading: false,
      error: null,
    })
  },
}))
