// Milestone Store - Zustand store for AgentPM milestones

import { create } from 'zustand'
import type { Milestone, UpdateEntity } from '@/types/agentpm'
import * as db from '@/services/agentpm/database'
import { isAuthError, handleAuthError } from '@/services/supabase/client'

interface MilestoneState {
  // State
  milestones: Milestone[]
  selectedMilestoneId: string | null
  isLoading: boolean
  error: string | null

  // Actions
  fetchMilestones: (projectId: string) => Promise<void>
  selectMilestone: (id: string | null) => void
  getMilestone: (id: string) => Milestone | undefined
  getMilestonesByProject: (projectId: string) => Milestone[]

  createMilestone: (milestone: Omit<Milestone, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Milestone>
  updateMilestone: (id: string, updates: UpdateEntity<Milestone>) => Promise<void>
  deleteMilestone: (id: string, userId: string) => Promise<void>

  // Derived data
  getActiveMilestones: (projectId: string) => Milestone[]
  getCompletedMilestones: (projectId: string) => Milestone[]

  // Clear
  clearMilestones: () => void
}

export const useMilestoneStore = create<MilestoneState>((set, get) => ({
  milestones: [],
  selectedMilestoneId: null,
  isLoading: false,
  error: null,

  fetchMilestones: async (projectId) => {
    set({ isLoading: true, error: null })

    try {
      console.log(`[MilestoneStore] Fetching milestones for project: ${projectId}`)
      const milestones = await db.fetchMilestones(projectId)
      console.log(`[MilestoneStore] Fetched ${milestones.length} milestones`)

      // Merge with existing milestones from other projects
      const existingOther = get().milestones.filter(m => m.projectId !== projectId)
      set({ milestones: [...existingOther, ...milestones], isLoading: false })
    } catch (err) {
      if (isAuthError(err)) {
        console.warn('[MilestoneStore] Auth error detected, signing out...')
        await handleAuthError()
        return
      }

      console.error('[MilestoneStore] Failed to fetch milestones:', err)
      set({
        error: err instanceof Error ? err.message : 'Failed to fetch milestones',
        isLoading: false,
      })
    }
  },

  selectMilestone: (id) => set({ selectedMilestoneId: id }),

  getMilestone: (id) => {
    return get().milestones.find((m) => m.id === id)
  },

  getMilestonesByProject: (projectId) => {
    return get().milestones.filter((m) => m.projectId === projectId)
  },

  createMilestone: async (milestoneData) => {
    const { milestones } = get()

    const milestone = await db.createMilestone(milestoneData)
    set({ milestones: [...milestones, milestone] })
    return milestone
  },

  updateMilestone: async (id, updates) => {
    const { milestones } = get()
    const currentMilestone = milestones.find((m) => m.id === id)
    if (!currentMilestone) return

    // Optimistic update
    set({
      milestones: milestones.map((m) =>
        m.id === id ? { ...m, ...updates, updatedAt: new Date().toISOString() } : m
      ),
    })

    try {
      await db.updateMilestone(id, updates)
    } catch (err) {
      // Revert on error
      set({ milestones })
      throw err
    }
  },

  deleteMilestone: async (id, userId) => {
    const { milestones } = get()

    // Optimistic update
    set({
      milestones: milestones.filter((m) => m.id !== id),
      selectedMilestoneId: get().selectedMilestoneId === id ? null : get().selectedMilestoneId,
    })

    try {
      await db.deleteMilestone(id, userId, 'user')
    } catch (err) {
      // Revert on error
      set({ milestones })
      throw err
    }
  },

  getActiveMilestones: (projectId) => {
    return get().milestones.filter(
      (m) => m.projectId === projectId && m.status !== 'completed'
    )
  },

  getCompletedMilestones: (projectId) => {
    return get().milestones.filter(
      (m) => m.projectId === projectId && m.status === 'completed'
    )
  },

  clearMilestones: () => {
    set({
      milestones: [],
      selectedMilestoneId: null,
      isLoading: false,
      error: null,
    })
  },
}))

// Selectors
export const selectMilestoneStats = (state: MilestoneState, projectId: string) => {
  const milestones = state.milestones.filter((m) => m.projectId === projectId)
  return {
    total: milestones.length,
    notStarted: milestones.filter((m) => m.status === 'not_started').length,
    inProgress: milestones.filter((m) => m.status === 'in_progress').length,
    completed: milestones.filter((m) => m.status === 'completed').length,
  }
}
