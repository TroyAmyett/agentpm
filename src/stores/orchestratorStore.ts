// Orchestrator Store — Zustand store for orchestrator config + guardrail audit log
// Manages the orchestrator_config table and guardrail_audit_log queries

import { create } from 'zustand'
import { supabase } from '@/services/supabase/client'
import type { OrchestratorConfig, GuardrailAuditEntry } from '@/types/agentpm'

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

interface OrchestratorState {
  // Config
  config: OrchestratorConfig | null
  loading: boolean
  error: string | null

  // Audit log
  auditLog: GuardrailAuditEntry[]
  auditLogTotal: number
  auditLoading: boolean

  // ── Config CRUD ───────────────────────────────────────────────────────
  fetchConfig: (accountId: string) => Promise<void>
  updateConfig: (updates: Partial<OrchestratorConfig>) => Promise<void>
  createConfig: (accountId: string, orchestratorAgentId: string) => Promise<void>

  // ── Audit Log ─────────────────────────────────────────────────────────
  fetchAuditLog: (accountId: string, options?: { limit?: number; offset?: number; category?: string; decision?: string }) => Promise<void>

  // ── Helpers ───────────────────────────────────────────────────────────
  clearError: () => void
}

// ─── Store ──────────────────────────────────────────────────────────────────

export const useOrchestratorStore = create<OrchestratorState>((set, get) => ({
  config: null,
  loading: false,
  error: null,
  auditLog: [],
  auditLogTotal: 0,
  auditLoading: false,

  // ── Fetch Config ──────────────────────────────────────────────────────

  fetchConfig: async (accountId: string) => {
    if (!supabase) return
    set({ loading: true, error: null })
    try {
      const { data, error } = await supabase
        .from('orchestrator_config')
        .select('*')
        .eq('account_id', accountId)
        .is('deleted_at', null)
        .single()

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
        throw error
      }

      set({
        config: data ? toCamelCaseKeys<OrchestratorConfig>(data as Record<string, unknown>) : null,
        loading: false,
      })
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch orchestrator config',
      })
    }
  },

  // ── Update Config ─────────────────────────────────────────────────────

  updateConfig: async (updates: Partial<OrchestratorConfig>) => {
    const { config } = get()
    if (!config || !supabase) return

    // Optimistic update
    const previousConfig = config
    set({ config: { ...config, ...updates }, error: null })

    try {
      // Convert to snake_case, remove id/accountId/timestamps
      const { id: _id, accountId: _acct, createdAt: _ca, updatedAt: _ua, ...rest } = updates
      void _id; void _acct; void _ca; void _ua
      const snakeUpdates = toSnakeCaseKeys(rest as Record<string, unknown>)
      snakeUpdates.updated_at = new Date().toISOString()

      const { error } = await supabase
        .from('orchestrator_config')
        .update(snakeUpdates)
        .eq('id', config.id)

      if (error) throw error

      // Log trust level changes to guardrail_audit_log
      const trustKeys = ['trustTaskExecution', 'trustDecomposition', 'trustSkillCreation', 'trustToolUsage', 'trustContentPublishing', 'trustExternalActions', 'trustSpending', 'trustAgentCreation'] as const
      for (const key of trustKeys) {
        if (key in updates) {
          const oldLevel = (previousConfig[key] as number) || 0
          const newLevel = (updates[key] as number) || 0
          if (newLevel !== oldLevel) {
            const category = toSnakeCase(key.replace('trust', '')).slice(1) // e.g. 'trustTaskExecution' → 'task_execution'
            supabase.from('guardrail_audit_log').insert({
              account_id: config.accountId,
              category,
              action: `Trust level changed: ${oldLevel} → ${newLevel}`,
              decision: newLevel > oldLevel ? 'escalated' : 'approved',
              decided_by: 'human',
              trust_level_required: newLevel,
              trust_level_current: oldLevel,
              rationale: `User changed ${category} trust from level ${oldLevel} to ${newLevel}`,
              metadata: { previousLevel: oldLevel, newLevel },
            }).then(() => {}) // fire-and-forget
          }
        }
      }
    } catch (err) {
      // Rollback on error
      set({
        config: previousConfig,
        error: err instanceof Error ? err.message : 'Failed to update orchestrator config',
      })
    }
  },

  // ── Create Config ─────────────────────────────────────────────────────

  createConfig: async (accountId: string, orchestratorAgentId: string) => {
    if (!supabase) return
    set({ loading: true, error: null })

    try {
      const { data, error } = await supabase
        .from('orchestrator_config')
        .insert({
          account_id: accountId,
          orchestrator_agent_id: orchestratorAgentId,
          dry_run_default: true,
          auto_route_root_tasks: false,
        })
        .select()
        .single()

      if (error) throw error

      set({
        config: data ? toCamelCaseKeys<OrchestratorConfig>(data as Record<string, unknown>) : null,
        loading: false,
      })
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to create orchestrator config',
      })
    }
  },

  // ── Fetch Audit Log ───────────────────────────────────────────────────

  fetchAuditLog: async (accountId, options = {}) => {
    if (!supabase) return
    set({ auditLoading: true })

    try {
      const limit = options.limit || 50
      const offset = options.offset || 0

      let query = supabase
        .from('guardrail_audit_log')
        .select('*', { count: 'exact' })
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (options.category) {
        query = query.eq('category', options.category)
      }
      if (options.decision) {
        query = query.eq('decision', options.decision)
      }

      const { data, count, error } = await query

      if (error) throw error

      set({
        auditLog: (data || []).map(row => toCamelCaseKeys<GuardrailAuditEntry>(row as Record<string, unknown>)),
        auditLogTotal: count || 0,
        auditLoading: false,
      })
    } catch (err) {
      set({
        auditLoading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch audit log',
      })
    }
  },

  // ── Helpers ───────────────────────────────────────────────────────────

  clearError: () => set({ error: null }),
}))
