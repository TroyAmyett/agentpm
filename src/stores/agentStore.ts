// Agent Store - Zustand store for AgentPM agent personas

import { create } from 'zustand'
import type { AgentPersona, UpdateEntity } from '@/types/agentpm'
import { DEFAULT_AGENT_PERSONAS } from '@/types/agentpm'
import * as db from '@/services/agentpm/database'
import { supabase, isAuthError, handleAuthError } from '@/services/supabase/client'

// Generate deterministic UUIDs for demo agents based on account ID
// Uses the first 8 chars of account_id as prefix to avoid cross-account conflicts
function getDemoAgentUUIDs(accountId: string): string[] {
  const prefix = accountId.substring(0, 8)
  return [
    `${prefix}-0000-0000-0000-000000000000`, // Atlas (orchestrator)
    `${prefix}-0000-0000-0000-000000000001`, // Maverick
    `${prefix}-0000-0000-0000-000000000002`, // Pixel
    `${prefix}-0000-0000-0000-000000000003`, // Scout
    `${prefix}-0000-0000-0000-000000000004`, // Forge
  ]
}

// Generate demo agents with full data for development
function createDemoAgents(accountId: string): AgentPersona[] {
  const now = new Date().toISOString()
  const uuids = getDemoAgentUUIDs(accountId)
  return DEFAULT_AGENT_PERSONAS.map((partial, index) => ({
    id: uuids[index] || `${accountId.substring(0, 8)}-0000-0000-0000-00000000000${index + 1}`,
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
    consecutiveSuccesses: partial.consecutiveSuccesses || 0,
    maxConsecutiveFailures: partial.maxConsecutiveFailures || 5,
    healthStatus: partial.healthStatus || 'healthy',
    isActive: partial.isActive ?? true,
    showOnDashboard: partial.showOnDashboard ?? true,
    showInOrgChart: partial.showInOrgChart ?? true,
    sortOrder: partial.sortOrder || index + 1,
    reportsTo: partial.reportsTo,
    tools: partial.tools,
    stats: {
      tasksCompleted: 0,
      tasksFailed: 0,
      successRate: 1.0, // Start trusted; real stats computed from task_executions
      avgExecutionTime: 0,
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
  setAutonomyOverride: (id: string, level: AgentPersona['autonomyLevel'], userId: string) => Promise<void>
  clearAutonomyOverride: (id: string, userId: string) => Promise<void>

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
    // Clear agents immediately to prevent showing stale data from previous account
    set({ agents: [], isLoading: true, error: null })

    try {
      console.log(`[AgentStore] Fetching agents for account: ${accountId}`)
      const agents = await db.fetchAgentPersonas(accountId)
      console.log(`[AgentStore] Fetched ${agents.length} agents from database`)

      // If no agents in database, seed demo agents into DB and use them
      if (agents.length === 0) {
        console.log('[AgentStore] No agents found, seeding demo agents into database')
        const demoAgents = createDemoAgents(accountId)
        set({ agents: demoAgents, isLoading: false })

        // Persist demo agents to DB so FK constraints on task_executions are satisfied
        if (supabase) {
          try {
            const { data: { user } } = await supabase.auth.getUser()
            const userId = user?.id
            if (userId) {
              const rows = demoAgents.map((a) => ({
                id: a.id,
                account_id: a.accountId,
                agent_type: a.agentType,
                alias: a.alias,
                tagline: a.tagline || null,
                avatar: a.avatar || null,
                description: a.description || null,
                capabilities: a.capabilities || [],
                restrictions: a.restrictions || [],
                triggers: a.triggers || [],
                autonomy_level: a.autonomyLevel || 'supervised',
                requires_approval: a.requiresApproval || [],
                can_spawn_agents: a.canSpawnAgents || false,
                can_modify_self: a.canModifySelf || false,
                consecutive_failures: a.consecutiveFailures || 0,
                max_consecutive_failures: a.maxConsecutiveFailures || 5,
                health_status: a.healthStatus || 'healthy',
                is_active: a.isActive ?? true,
                show_on_dashboard: a.showOnDashboard ?? true,
                show_in_org_chart: a.showInOrgChart ?? true,
                sort_order: a.sortOrder,
                reports_to: a.reportsTo || null,
                tools: a.tools || null,
                created_by: userId,
                created_by_type: 'user',
                updated_by: userId,
                updated_by_type: 'user',
              }))
              const { error: seedError } = await supabase
                .from('agent_personas')
                .insert(rows)
              if (seedError) {
                console.warn('[AgentStore] Failed to seed demo agents:', seedError)
              } else {
                console.log(`[AgentStore] Seeded ${rows.length} demo agents into database`)
              }
            }
          } catch (seedErr) {
            console.warn('[AgentStore] Error seeding demo agents:', seedErr)
          }
        }
      } else {
        set({ agents, isLoading: false })
      }
    } catch (err) {
      // Check if this is an auth error (expired JWT, etc.)
      if (isAuthError(err)) {
        console.warn('[AgentStore] Auth error detected, signing out...')
        await handleAuthError()
        return
      }

      // On error (e.g. Supabase not configured), use demo agents
      console.warn('[AgentStore] Could not fetch agents, using demo data:', err)
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
      consecutiveSuccesses: 0,
      healthStatus: 'healthy',
      lastHealthCheck: new Date().toISOString(),
      updatedBy: userId,
      updatedByType: 'user',
    })
  },

  setAutonomyOverride: async (id, level, userId) => {
    await get().updateAgent(id, {
      autonomyLevel: level,
      autonomyOverride: level,
      autonomyOverrideBy: userId,
      autonomyOverrideAt: new Date().toISOString(),
      updatedBy: userId,
      updatedByType: 'user',
    })
  },

  clearAutonomyOverride: async (id, userId) => {
    await get().updateAgent(id, {
      autonomyOverride: undefined,
      autonomyOverrideBy: undefined,
      autonomyOverrideAt: undefined,
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
