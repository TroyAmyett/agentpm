import { create } from 'zustand'
import type { UserTemplate } from '@/types'
import type { JSONContent } from '@tiptap/react'
import * as db from '@/services/supabase/database'

interface TemplatesState {
  templates: UserTemplate[]
  isLoading: boolean
  error: string | null

  // Auth state
  userId: string | null

  // Actions
  setUserId: (userId: string | null) => void
  loadTemplates: (userId: string) => Promise<void>
  createTemplate: (template: {
    name: string
    description?: string
    icon?: string
    category?: string
    content: JSONContent
  }) => Promise<UserTemplate>
  updateTemplate: (id: string, updates: Partial<UserTemplate>) => Promise<void>
  deleteTemplate: (id: string) => Promise<void>
  toggleFavorite: (id: string) => Promise<void>
  clearTemplates: () => void
}

export const useTemplatesStore = create<TemplatesState>()((set, get) => ({
  templates: [],
  isLoading: false,
  error: null,
  userId: null,

  setUserId: (userId) => {
    set({ userId })
  },

  loadTemplates: async (userId) => {
    set({ isLoading: true, error: null })
    try {
      const templates = await db.fetchUserTemplates(userId)
      set({ templates, isLoading: false, userId })
    } catch (error) {
      console.error('Failed to load templates:', error)
      set({
        error: error instanceof Error ? error.message : 'Failed to load templates',
        isLoading: false,
      })
    }
  },

  createTemplate: async (templateData) => {
    const { userId } = get()
    if (!userId) throw new Error('User not authenticated')

    const newTemplate = await db.createUserTemplate({
      user_id: userId,
      name: templateData.name,
      description: templateData.description || null,
      icon: templateData.icon || 'file-text',
      category: templateData.category || null,
      content: templateData.content,
      is_favorite: false,
    })

    set((state) => ({
      templates: [newTemplate, ...state.templates],
    }))

    return newTemplate
  },

  updateTemplate: async (id, updates) => {
    await db.updateUserTemplate(id, updates)

    set((state) => ({
      templates: state.templates.map((t) =>
        t.id === id ? { ...t, ...updates, updated_at: new Date().toISOString() } : t
      ),
    }))
  },

  deleteTemplate: async (id) => {
    await db.deleteUserTemplate(id)

    set((state) => ({
      templates: state.templates.filter((t) => t.id !== id),
    }))
  },

  toggleFavorite: async (id) => {
    const template = get().templates.find((t) => t.id === id)
    if (!template) return

    await db.updateUserTemplate(id, { is_favorite: !template.is_favorite })

    set((state) => ({
      templates: state.templates.map((t) =>
        t.id === id ? { ...t, is_favorite: !t.is_favorite } : t
      ),
    }))
  },

  clearTemplates: () => {
    set({ templates: [], userId: null })
  },
}))
