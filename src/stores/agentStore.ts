// Agent Store - Zustand store for AgentPM agent personas

import { create } from 'zustand'
import type { AgentPersona, UpdateEntity } from '@/types/agentpm'
import { DEFAULT_AGENT_PERSONAS } from '@/types/agentpm'
import * as db from '@/services/agentpm/database'

// Generate demo agents with full data for development
function createDemoAgents(accountId: string): AgentPersona[] {
  const now = new Date().toISOString()
  return DEFAULT_AGENT_PERSONAS.map((partial, index) => ({
    id: `demo-agent-${index + 1}`,
    accountId,
    createdAt: now,
    createdBy: 'system',
    createdByType: 'agent' as const,
    updatedAt: now,
    updatedBy: 'system',
    updatedByType: 'agent' as const,
    agentType: partial.agentType || 'Custom',
    alias: partial.alias || `Agent ${index + 1}`,
    tagline: partial.tagline,
    avatar: partial.avatar,
    description: partial.tagline,
    capabilities: partial.capabilities || [],
    restrictions: partial.restrictions || [],
    triggers: partial.triggers || [],
    autonomyLevel: partial.autonomyLevel || 'supervised',
    requiresApproval: partial.requiresApproval || [],
    canSpawnAgents: partial.canSpawnAgents || false,
    canModifySelf: partial.canModifySelf || false,
    consecutiveFailures: partial.consecutiveFailures || 0,
    maxConsecutiveFailures: partial.maxConsecutiveFailures || 5,
    healthStatus: partial.healthStatus || 'healthy',
    isActive: partial.isActive ?? true,
    showOnDashboard: partial.showOnDashboard ?? true,
    showInOrgChart: partial.showInOrgChart ?? true,
    sortOrder: partial.sortOrder || index + 1,
    stats: {
      tasksCompleted: Math.floor(Math.random() * 50) + 5,
      tasksFailed: Math.floor(Math.random() * 5),
      successRate: 0.85 + Math.random() * 0.14,
      avgExecutionTime: 5000 + Math.random() * 55000,
    },
  }))
}

interface AgentState {
  // State
  agents: AgentPersona[]
  selectedAgentId: string | null
  isLoading: boolean
  error: string | null

  // Actions
  fetchAgents: (accountId: string) => Promise<void>
  selectAgent: (id: string | null) => void
  getAgent: (id: string) => AgentPersona | undefined
  getSelectedAgent: () => AgentPersona | null

  updateAgent: (id: string, updates: UpdateEntity<AgentPersona>) => Promise<void>
  pauseAgent: (id: string, userId: string, reason: string) => Promise<void>
  resumeAgent: (id: string, userId: string) => Promise<void>
  resetAgentHealth: (id: string, userId: string) => Promise<void>

  // Realtime handlers
  handleRemoteAgentChange: (agent: AgentPersona) => void
  handleRemoteAgentDelete: (id: string) => void

  // Subscription
  subscribeToAgents: (accountId: string) => () => void

  // Clear
  clearAgents: () => void
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  selectedAgentId: null,
  isLoading: false,
  error: null,

  fetchAgents: async (accountId) => {
    set({ isLoading: true, error: null })
    try {
      const agents = await db.fetchAgentPersonas(accountId)
      // If no agents in database, use demo agents for development
      if (agents.length === 0) {
        set({ agents: createDemoAgents(accountId), isLoading: false })
      } else {
        set({ agents, isLoading: false })
      }
    } catch (err) {
      // On error (e.g. Supabase not configured), use demo agents
      console.warn('Could not fetch agents, using demo data:', err)
      set({ agents: createDemoAgents(accountId), isLoading: false, error: null })
    }
  },

  selectAgent: (id) => set({ selectedAgentId: id }),

  getAgent: (id) => {
    return get().agents.find((a) => a.id === id)
  },

  getSelectedAgent: () => {
    const { agents, selectedAgentId } = get()
    return agents.find((a) => a.id === selectedAgentId) || null
  },

  updateAgent: async (id, updates) => {
    const { agents } = get()
    const currentAgent = agents.find((a) => a.id === id)
    if (!currentAgent) return

    // Optimistic update
    set({
      agents: agents.map((a) =>
        a.id === id ? { ...a, ...updates, updatedAt: new Date().toISOString() } : a
      ),
    })

    try {
      await db.updateAgentPersona(id, updates)
    } catch (err) {
      // Revert on error
      set({ agents })
      throw err
    }
  },

  pauseAgent: async (id, userId, reason) => {
    await get().updateAgent(id, {
      pausedAt: new Date().toISOString(),
      pausedBy: userId,
      pauseReason: reason,
      updatedBy: userId,
      updatedByType: 'user',
    })
  },

  resumeAgent: async (id, userId) => {
    await get().updateAgent(id, {
      pausedAt: undefined,
      pausedBy: undefined,
      pauseReason: undefined,
      updatedBy: userId,
      updatedByType: 'user',
    })
  },

  resetAgentHealth: async (id, userId) => {
    await get().updateAgent(id, {
      consecutiveFailures: 0,
      healthStatus: 'healthy',
      lastHealthCheck: new Date().toISOString(),
      updatedBy: userId,
      updatedByType: 'user',
    })
  },

  handleRemoteAgentChange: (remoteAgent) => {
    set((state) => {
      const existingIndex = state.agents.findIndex((a) => a.id === remoteAgent.id)
      if (existingIndex >= 0) {
        // Update existing
        const newAgents = [...state.agents]
        newAgents[existingIndex] = remoteAgent
        return { agents: newAgents }
      } else {
        // Insert new
        return { agents: [...state.agents, remoteAgent] }
      }
    })
  },

  handleRemoteAgentDelete: (id) => {
    set((state) => ({
      agents: state.agents.filter((a) => a.id !== id),
      selectedAgentId: state.selectedAgentId === id ? null : state.selectedAgentId,
    }))
  },

  subscribeToAgents: (accountId) => {
    const { handleRemoteAgentChange, handleRemoteAgentDelete } = get()
    return db.subscribeToAgentPersonas(
      accountId,
      handleRemoteAgentChange,
      handleRemoteAgentChange,
      handleRemoteAgentDelete
    )
  },

  clearAgents: () => {
    set({
      agents: [],
      selectedAgentId: null,
      isLoading: false,
      error: null,
    })
  },
}))

// Selectors
export const selectActiveAgents = (state: AgentState) =>
  state.agents.filter((a) => a.isActive && !a.pausedAt && a.showOnDashboard)

export const selectHealthyAgents = (state: AgentState) =>
  state.agents.filter((a) => a.healthStatus === 'healthy')

export const selectAgentsByType = (state: AgentState, type: string) =>
  state.agents.filter((a) => a.agentType === type)
