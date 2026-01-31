// Execution Logger - SOC2-grade audit trail for all LLM and tool operations
// Every LLM call, tool invocation, and cost is logged for compliance and analysis.
// All logging is fire-and-forget to never block execution flow.

import { supabase } from '@/services/supabase/client'

// ─── Types ───────────────────────────────────────────────────────────────────

export type AuditEventType = 'llm_call' | 'tool_call' | 'plan_generated' | 'plan_approved' | 'error'

export interface AuditEvent {
  executionId?: string
  eventType: AuditEventType
  accountId: string

  // LLM call fields
  provider?: string
  model?: string
  inputTokens?: number
  outputTokens?: number
  durationMs?: number
  costCents?: number

  // Tool call fields
  toolName?: string
  toolInput?: Record<string, unknown>
  toolOutput?: string
  toolSuccess?: boolean

  // Context
  agentId?: string
  taskId?: string
  stepIndex?: number

  // Error
  errorMessage?: string
  errorCode?: string
}

// ─── Cost Estimation ─────────────────────────────────────────────────────────

const COST_PER_MILLION: Record<string, { input: number; output: number }> = {
  // Anthropic
  'claude-sonnet-4-20250514': { input: 300, output: 1500 },
  'claude-3-5-sonnet-20241022': { input: 300, output: 1500 },
  'claude-3-haiku-20240307': { input: 25, output: 125 },
  'claude-opus-4-5-20251101': { input: 1500, output: 7500 },
  // OpenAI
  'gpt-4o': { input: 250, output: 1000 },
  'gpt-4o-mini': { input: 15, output: 60 },
  'gpt-4-turbo': { input: 1000, output: 3000 },
  // Defaults
  _default: { input: 300, output: 1500 },
}

export function estimateCostCents(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = COST_PER_MILLION[model] || COST_PER_MILLION._default
  const inputCost = (inputTokens / 1_000_000) * pricing.input
  const outputCost = (outputTokens / 1_000_000) * pricing.output
  return Math.round(inputCost + outputCost)
}

// ─── Logging Functions ───────────────────────────────────────────────────────

/**
 * Log a single audit event. Fire-and-forget — never throws.
 */
export async function logAuditEvent(event: AuditEvent): Promise<void> {
  if (!supabase) return

  try {
    await supabase.from('execution_audit_log').insert({
      execution_id: event.executionId || null,
      event_type: event.eventType,
      account_id: event.accountId,
      provider: event.provider || null,
      model: event.model || null,
      input_tokens: event.inputTokens || null,
      output_tokens: event.outputTokens || null,
      duration_ms: event.durationMs || null,
      cost_cents: event.costCents || 0,
      tool_name: event.toolName || null,
      tool_input: event.toolInput || null,
      tool_output: event.toolOutput ? truncate(event.toolOutput, 10000) : null,
      tool_success: event.toolSuccess ?? null,
      agent_id: event.agentId || null,
      task_id: event.taskId || null,
      step_index: event.stepIndex ?? null,
      error_message: event.errorMessage || null,
      error_code: event.errorCode || null,
    })
  } catch (err) {
    console.warn('[AuditLog] Failed to log event:', err)
  }
}

/**
 * Log an LLM call (chat completion request/response).
 */
export function logLLMCall(params: {
  executionId?: string
  accountId: string
  agentId?: string
  taskId?: string
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  durationMs: number
  stepIndex?: number
}): void {
  const costCents = estimateCostCents(params.model, params.inputTokens, params.outputTokens)

  logAuditEvent({
    executionId: params.executionId,
    eventType: 'llm_call',
    accountId: params.accountId,
    provider: params.provider,
    model: params.model,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    durationMs: params.durationMs,
    costCents,
    agentId: params.agentId,
    taskId: params.taskId,
    stepIndex: params.stepIndex,
  }).catch(() => {})
}

/**
 * Log a tool invocation (call + result).
 */
export function logToolCall(params: {
  executionId?: string
  accountId: string
  agentId?: string
  taskId?: string
  toolName: string
  toolInput: Record<string, unknown>
  toolOutput: string
  toolSuccess: boolean
  durationMs: number
  stepIndex?: number
}): void {
  logAuditEvent({
    executionId: params.executionId,
    eventType: 'tool_call',
    accountId: params.accountId,
    toolName: params.toolName,
    toolInput: params.toolInput,
    toolOutput: params.toolOutput,
    toolSuccess: params.toolSuccess,
    durationMs: params.durationMs,
    agentId: params.agentId,
    taskId: params.taskId,
    stepIndex: params.stepIndex,
  }).catch(() => {})
}

/**
 * Log an error during execution.
 */
export function logExecutionError(params: {
  executionId?: string
  accountId: string
  agentId?: string
  taskId?: string
  errorMessage: string
  errorCode?: string
}): void {
  logAuditEvent({
    executionId: params.executionId,
    eventType: 'error',
    accountId: params.accountId,
    agentId: params.agentId,
    taskId: params.taskId,
    errorMessage: params.errorMessage,
    errorCode: params.errorCode,
  }).catch(() => {})
}

/**
 * Log plan generation.
 */
export function logPlanGenerated(params: {
  accountId: string
  taskId: string
  agentId?: string
  model: string
  provider: string
  inputTokens: number
  outputTokens: number
  durationMs: number
  stepCount: number
}): void {
  logAuditEvent({
    eventType: 'plan_generated',
    accountId: params.accountId,
    taskId: params.taskId,
    agentId: params.agentId,
    model: params.model,
    provider: params.provider,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    durationMs: params.durationMs,
    costCents: estimateCostCents(params.model, params.inputTokens, params.outputTokens),
  }).catch(() => {})
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen) + '...[truncated]' : str
}
