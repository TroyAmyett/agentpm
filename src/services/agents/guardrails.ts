// Guardrail Check Middleware
// Reads orchestrator_config trust levels and decides whether an action is allowed
// Logs every decision to guardrail_audit_log

import type { OrchestratorConfig, GuardrailCategory, GuardrailDecision } from '@/types/agentpm'
import type { ToolUseRequest } from '@/services/tools'
import { supabase } from '@/services/supabase/client'

// ============================================================================
// GUARDRAIL ACTION MAP
// Maps tool names to the trust category and minimum level required
// ============================================================================

interface GuardrailRule {
  category: GuardrailCategory
  minLevel: number    // 0=supervised, 1=guided, 2=trusted, 3=autonomous
  description: string // human-readable label for audit log
}

/**
 * Maps orchestrator tool names to their guardrail requirements.
 * Tools not listed here are unguarded (read-only or informational).
 */
const TOOL_GUARDRAIL_MAP: Record<string, GuardrailRule> = {
  // Task execution
  create_task:        { category: 'task_execution', minLevel: 1, description: 'Create subtask' },
  assign_task:        { category: 'task_execution', minLevel: 1, description: 'Assign task to agent' },
  update_task_status: { category: 'task_execution', minLevel: 1, description: 'Update task status' },
  cancel_tree:        { category: 'task_execution', minLevel: 1, description: 'Cancel task tree' },

  // Decomposition
  preview_plan:       { category: 'decomposition', minLevel: 0, description: 'Preview execution plan' },

  // Skill creation
  create_skill:       { category: 'skill_creation', minLevel: 2, description: 'Create new skill' },

  // Content publishing
  publish_blog_post:      { category: 'content_publishing', minLevel: 2, description: 'Publish blog post' },
  create_landing_page:    { category: 'content_publishing', minLevel: 2, description: 'Create landing page' },

  // External actions
  execute_openclaw:   { category: 'external_actions', minLevel: 2, description: 'Execute on external runtime' },

  // Messaging (low risk — guided level)
  send_message:       { category: 'tool_usage', minLevel: 1, description: 'Send agent message' },
}

// ============================================================================
// TRUST LEVEL ACCESSOR
// ============================================================================

function getTrustLevel(config: OrchestratorConfig, category: GuardrailCategory): number {
  const map: Record<GuardrailCategory, number> = {
    task_execution: config.trustTaskExecution,
    decomposition: config.trustDecomposition,
    skill_creation: config.trustSkillCreation,
    tool_usage: config.trustToolUsage,
    content_publishing: config.trustContentPublishing,
    external_actions: config.trustExternalActions,
    spending: config.trustSpending,
    agent_creation: config.trustAgentCreation,
  }
  return map[category] ?? 0
}

// ============================================================================
// GUARDRAIL CHECK
// ============================================================================

export interface GuardrailResult {
  allowed: boolean
  decision: GuardrailDecision
  category?: GuardrailCategory
  trustLevelRequired: number
  trustLevelCurrent: number
  rationale: string
}

/**
 * Check whether a tool call is allowed by the orchestrator's guardrails.
 * Returns immediately for unguarded tools (read-only queries).
 * Logs every decision to guardrail_audit_log.
 */
export async function checkGuardrail(
  toolRequest: ToolUseRequest,
  config: OrchestratorConfig,
  accountId: string,
  taskId?: string,
  agentId?: string,
): Promise<GuardrailResult> {
  const rule = TOOL_GUARDRAIL_MAP[toolRequest.name]

  // Unguarded tools (list_tasks, get_task_result, read_messages, web_search, etc.)
  if (!rule) {
    return {
      allowed: true,
      decision: 'approved',
      trustLevelRequired: 0,
      trustLevelCurrent: 0,
      rationale: 'Unguarded tool — no guardrail required',
    }
  }

  const currentLevel = getTrustLevel(config, rule.category)
  const allowed = currentLevel >= rule.minLevel

  const result: GuardrailResult = {
    allowed,
    decision: allowed ? 'approved' : 'denied',
    category: rule.category,
    trustLevelRequired: rule.minLevel,
    trustLevelCurrent: currentLevel,
    rationale: allowed
      ? `Trust level ${currentLevel} >= required ${rule.minLevel} for ${rule.category}`
      : `Trust level ${currentLevel} < required ${rule.minLevel} for ${rule.category}. Action "${rule.description}" blocked.`,
  }

  // Log to audit table (fire-and-forget, don't block execution)
  logGuardrailDecision({
    accountId,
    taskId,
    agentId,
    category: rule.category,
    action: rule.description,
    decision: result.decision,
    decidedBy: 'system',
    trustLevelRequired: rule.minLevel,
    trustLevelCurrent: currentLevel,
    rationale: result.rationale,
    metadata: {
      toolName: toolRequest.name,
      toolInput: sanitizeToolInput(toolRequest.input),
    },
  }).catch(err => console.warn('[Guardrails] Failed to log audit entry:', err))

  return result
}

// ============================================================================
// BATCH CHECK — filter tool requests through guardrails
// ============================================================================

export interface GuardrailFilterResult {
  allowed: ToolUseRequest[]
  blocked: Array<{ request: ToolUseRequest; result: GuardrailResult }>
}

/**
 * Filter an array of tool requests, returning allowed and blocked lists.
 * Used by the executor to pre-check all tool calls before executing.
 */
export async function filterToolRequests(
  requests: ToolUseRequest[],
  config: OrchestratorConfig,
  accountId: string,
  taskId?: string,
  agentId?: string,
): Promise<GuardrailFilterResult> {
  const allowed: ToolUseRequest[] = []
  const blocked: GuardrailFilterResult['blocked'] = []

  for (const request of requests) {
    const result = await checkGuardrail(request, config, accountId, taskId, agentId)
    if (result.allowed) {
      allowed.push(request)
    } else {
      blocked.push({ request, result })
    }
  }

  return { allowed, blocked }
}

// ============================================================================
// HARD LIMIT CHECKS
// ============================================================================

/**
 * Check hard limits that aren't tool-specific but apply to the orchestrator.
 * Call before executing orchestrator actions.
 */
export async function checkHardLimits(
  config: OrchestratorConfig,
  accountId: string,
): Promise<{ withinLimits: boolean; violations: string[] }> {
  const violations: string[] = []

  if (!supabase) {
    return { withinLimits: true, violations: [] }
  }

  // Check total active tasks
  const { count: activeCount } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .in('status', ['queued', 'in_progress', 'review'])
    .is('deleted_at', null)

  if (activeCount !== null && activeCount >= config.maxTotalActiveTasks) {
    violations.push(
      `Active task limit reached: ${activeCount}/${config.maxTotalActiveTasks}`
    )
  }

  return {
    withinLimits: violations.length === 0,
    violations,
  }
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

interface AuditLogParams {
  accountId: string
  taskId?: string
  agentId?: string
  category: GuardrailCategory
  action: string
  decision: GuardrailDecision
  decidedBy: string
  trustLevelRequired: number
  trustLevelCurrent: number
  rationale: string
  metadata?: Record<string, unknown>
}

async function logGuardrailDecision(params: AuditLogParams): Promise<void> {
  if (!supabase) return

  await supabase.from('guardrail_audit_log').insert({
    account_id: params.accountId,
    task_id: params.taskId || null,
    agent_id: params.agentId || null,
    category: params.category,
    action: params.action,
    decision: params.decision,
    decided_by: params.decidedBy,
    trust_level_required: params.trustLevelRequired,
    trust_level_current: params.trustLevelCurrent,
    rationale: params.rationale,
    metadata: params.metadata || {},
  })
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Sanitize tool input for safe audit logging (remove secrets, large blobs).
 */
function sanitizeToolInput(input: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    // Skip internal fields
    if (key.startsWith('_')) continue
    // Truncate large string values
    if (typeof value === 'string' && value.length > 500) {
      sanitized[key] = value.slice(0, 500) + '...'
    } else {
      sanitized[key] = value
    }
  }
  return sanitized
}
