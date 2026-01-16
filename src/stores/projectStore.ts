// Project Store - Zustand store for AgentPM projects

import { create } from 'zustand'
import type { Project, UpdateEntity } from '@/types/agentpm'
import * as db from '@/services/agentpm/database'

interface ProjectState {
  // State
  projects: Project[]
  selectedProjectId: string | null
  isLoading: boolean
  error: string | null

  // Actions
  fetchProjects: (accountId: string) => Promise<void>
  selectProject: (id: string | null) => void
  getProject: (id: string) => Project | undefined
  getSelectedProject: () => Project | null

  createProject: (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'stats'>) => Promise<Project>
  updateProject: (id: string, updates: UpdateEntity<Project>) => Promise<void>
  deleteProject: (id: string, userId: string) => Promise<void>

  // Derived data
  getActiveProjects: () => Project[]
  getCompletedProjects: () => Project[]

  // Clear
  clearProjects: () => void
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  selectedProjectId: null,
  isLoading: false,
  error: null,

  fetchProjects: async (accountId) => {
    set({ isLoading: true, error: null })
    try {
      const projects = await db.fetchProjects(accountId)
      set({ projects, isLoading: false })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to fetch projects',
        isLoading: false,
      })
    }
  },

  selectProject: (id) => set({ selectedProjectId: id }),

  getProject: (id) => {
    return get().projects.find((p) => p.id === id)
  },

  getSelectedProject: () => {
    const { projects, selectedProjectId } = get()
    return projects.find((p) => p.id === selectedProjectId) || null
  },

  createProject: async (projectData) => {
    const { projects } = get()

    const project = await db.createProject(projectData)
    set({ projects: [project, ...projects] })
    return project
  },

  updateProject: async (id, updates) => {
    const { projects } = get()
    const currentProject = projects.find((p) => p.id === id)
    if (!currentProject) return

    // Optimistic update
    set({
      projects: projects.map((p) =>
        p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
      ),
    })

    try {
      await db.updateProject(id, updates)
    } catch (err) {
      // Revert on error
      set({ projects })
      throw err
    }
  },

  deleteProject: async (id, userId) => {
    const { projects } = get()

    // Optimistic update
    set({
      projects: projects.filter((p) => p.id !== id),
      selectedProjectId: get().selectedProjectId === id ? null : get().selectedProjectId,
    })

    try {
      await db.deleteProject(id, userId, 'user')
    } catch (err) {
      // Revert on error
      set({ projects })
      throw err
    }
  },

  getActiveProjects: () => {
    return get().projects.filter((p) => p.status === 'active')
  },

  getCompletedProjects: () => {
    return get().projects.filter((p) => p.status === 'completed')
  },

  clearProjects: () => {
    set({
      projects: [],
      selectedProjectId: null,
      isLoading: false,
      error: null,
    })
  },
}))

// Selectors
export const selectProjectStats = (state: ProjectState) => {
  const projects = state.projects
  return {
    total: projects.length,
    active: projects.filter((p) => p.status === 'active').length,
    onHold: projects.filter((p) => p.status === 'on_hold').length,
    completed: projects.filter((p) => p.status === 'completed').length,
    cancelled: projects.filter((p) => p.status === 'cancelled').length,
  }
}
