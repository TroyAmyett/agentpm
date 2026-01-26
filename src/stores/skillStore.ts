// Skill Store - Zustand store for AgentPM skills management

import { create } from 'zustand'
import type { Skill, SkillBuilderMessage, SkillCategory } from '@/types/agentpm'
import * as skillsService from '@/services/skills'
import { isAuthError, handleAuthError } from '@/services/supabase/client'

interface SkillState {
  // State
  skills: Skill[]
  officialSkills: Skill[] // @fun/ skills for discovery
  selectedSkillId: string | null
  isLoading: boolean
  error: string | null

  // Actions
  fetchSkills: (accountId: string) => Promise<void>
  fetchOfficialSkills: () => Promise<void>
  selectSkill: (id: string | null) => void
  getSkill: (id: string) => Skill | undefined

  importFromGitHub: (url: string, accountId: string, userId: string) => Promise<Skill>
  importFromRaw: (content: string, accountId: string, userId: string, name?: string) => Promise<Skill>

  // Skills Builder
  createFromBuilder: (
    accountId: string,
    userId: string,
    skill: {
      name: string
      description: string
      content: string
      category?: SkillCategory
      forkedFrom?: string
      builderConversation: SkillBuilderMessage[]
    }
  ) => Promise<Skill>
  updateFromBuilder: (
    id: string,
    skill: {
      name: string
      description: string
      content: string
      category?: SkillCategory
      builderConversation: SkillBuilderMessage[]
    }
  ) => Promise<Skill>

  toggleEnabled: (id: string, isEnabled: boolean) => Promise<void>
  checkForUpdates: (skill: Skill) => Promise<boolean>
  syncSkill: (skill: Skill) => Promise<void>
  deleteSkill: (id: string) => Promise<void>

  // Derived data
  getEnabledSkills: () => Skill[]
  getSkillsBySource: (sourceType: Skill['sourceType']) => Skill[]

  // Clear
  clearSkills: () => void
  clearError: () => void
}

export const useSkillStore = create<SkillState>((set, get) => ({
  skills: [],
  officialSkills: [],
  selectedSkillId: null,
  isLoading: false,
  error: null,

  fetchSkills: async (accountId) => {
    // Clear skills immediately to prevent showing stale data from previous account
    set({ skills: [], isLoading: true, error: null })

    try {
      console.log(`[SkillStore] Fetching skills for account: ${accountId}`)
      const skills = await skillsService.fetchSkills(accountId)
      console.log(`[SkillStore] Fetched ${skills.length} skills from database`)
      set({ skills, isLoading: false })
    } catch (err) {
      // Check if this is an auth error (expired JWT, etc.)
      if (isAuthError(err)) {
        console.warn('[SkillStore] Auth error detected, signing out...')
        await handleAuthError()
        return
      }

      console.error('[SkillStore] Failed to fetch skills:', err)
      set({
        skills: [],
        error: err instanceof Error ? err.message : 'Failed to fetch skills',
        isLoading: false,
      })
    }
  },

  fetchOfficialSkills: async () => {
    try {
      const officialSkills = await skillsService.fetchOfficialSkills()
      set({ officialSkills })
    } catch (err) {
      console.error('Failed to fetch official skills:', err)
    }
  },

  selectSkill: (id) => set({ selectedSkillId: id }),

  getSkill: (id) => {
    return get().skills.find((s) => s.id === id)
  },

  importFromGitHub: async (url, accountId, userId) => {
    set({ isLoading: true, error: null })
    try {
      const skill = await skillsService.importFromGitHub(url, accountId, userId)
      set((state) => ({
        skills: [skill, ...state.skills],
        isLoading: false,
      }))
      return skill
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to import from GitHub'
      set({ error: message, isLoading: false })
      throw new Error(message)
    }
  },

  importFromRaw: async (content, accountId, userId, name) => {
    set({ isLoading: true, error: null })
    try {
      const skill = await skillsService.importFromRaw(content, accountId, userId, name)
      set((state) => ({
        skills: [skill, ...state.skills],
        isLoading: false,
      }))
      return skill
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create skill'
      set({ error: message, isLoading: false })
      throw new Error(message)
    }
  },

  createFromBuilder: async (accountId, userId, skillInput) => {
    set({ isLoading: true, error: null })
    try {
      const skill = await skillsService.createBuilderSkill({
        accountId,
        userId,
        ...skillInput,
      })
      set((state) => ({
        skills: [skill, ...state.skills],
        isLoading: false,
      }))
      return skill
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create skill'
      set({ error: message, isLoading: false })
      throw new Error(message)
    }
  },

  updateFromBuilder: async (id, skillInput) => {
    set({ isLoading: true, error: null })
    try {
      const skill = await skillsService.updateBuilderSkill(id, skillInput)
      set((state) => ({
        skills: state.skills.map((s) => (s.id === id ? skill : s)),
        isLoading: false,
      }))
      return skill
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update skill'
      set({ error: message, isLoading: false })
      throw new Error(message)
    }
  },

  toggleEnabled: async (id, isEnabled) => {
    const { skills } = get()

    // Optimistic update
    set({
      skills: skills.map((s) => (s.id === id ? { ...s, isEnabled } : s)),
    })

    try {
      await skillsService.toggleSkillEnabled(id, isEnabled)
    } catch (err) {
      // Revert on error
      set({ skills })
      throw err
    }
  },

  checkForUpdates: async (skill) => {
    try {
      return await skillsService.checkForUpdates(skill)
    } catch (err) {
      console.error('Error checking for updates:', err)
      return false
    }
  },

  syncSkill: async (skill) => {
    set({ isLoading: true, error: null })
    try {
      const updated = await skillsService.syncSkill(skill)
      set((state) => ({
        skills: state.skills.map((s) => (s.id === updated.id ? updated : s)),
        isLoading: false,
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to sync skill'
      set({ error: message, isLoading: false })
      throw new Error(message)
    }
  },

  deleteSkill: async (id) => {
    const { skills } = get()

    // Optimistic update
    set({
      skills: skills.filter((s) => s.id !== id),
      selectedSkillId: get().selectedSkillId === id ? null : get().selectedSkillId,
    })

    try {
      await skillsService.deleteSkill(id)
    } catch (err) {
      // Revert on error
      set({ skills })
      throw err
    }
  },

  getEnabledSkills: () => {
    return get().skills.filter((s) => s.isEnabled)
  },

  getSkillsBySource: (sourceType) => {
    return get().skills.filter((s) => s.sourceType === sourceType)
  },

  clearSkills: () => {
    set({
      skills: [],
      selectedSkillId: null,
      isLoading: false,
      error: null,
    })
  },

  clearError: () => set({ error: null }),
}))
