// Annealing Loop - Post-execution learning and trust adjustment
// Called after every task execution to update agent health, stats, and plan patterns
// Implements asymmetric recovery: fast degradation, slow rebuilding

import type { HealthStatus } from '@/types/agentpm'
import { supabase } from '@/services/supabase/client'
import { computeTrustScore } from './trustEngine'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ExecutionOutcome {
  executionId: string
  taskId: string
  agentId: string
  accountId: string
  success: boolean
  toolsUsed: Array<{ name: string; success: boolean }>
  durationMs: number
  inputTokens: number
  outputTokens: number
  patternKey?: string
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

/**
 * Process the outcome of a task execution.
 * Updates agent health, failure/success streaks, and pattern learning.
 * Called from executionStore.runTask() after every execution.
 */
export async function processExecutionOutcome(outcome: ExecutionOutcome): Promise<void> {
  if (!supabase) return

  try {
    await Promise.all([
      updateAgentStreaks(outcome),
      updateExecutionMetadata(outcome),
      outcome.patternKey ? updatePlanPattern(outcome) : Promise.resolve(),
    ])

    // After updating streaks, check if autonomy should auto-adjust
    await autoAdjustAutonomy(outcome.agentId, outcome.accountId)
  } catch (err) {
    // Never let annealing errors break the execution flow
    console.error('[Annealing] Error processing outcome:', err)
  }
}

// ─── Agent Streak Management ─────────────────────────────────────────────────

/**
 * Update consecutive failures/successes and health status.
 * Degradation is fast, recovery is slow (asymmetric by design).
 */
async function updateAgentStreaks(outcome: ExecutionOutcome): Promise<void> {
  // Fetch current agent state
  const { data: agent, error: fetchErr } = await supabase!
    .from('agent_personas')
    .select('consecutive_failures, consecutive_successes, max_consecutive_failures, health_status, autonomy_override')
    .eq('id', outcome.agentId)
    .single()

  if (fetchErr || !agent) {
    console.warn('[Annealing] Could not fetch agent:', fetchErr?.message)
    return
  }

  const currentFailures: number = agent.consecutive_failures || 0
  const currentSuccesses: number = agent.consecutive_successes || 0
  const maxFailures: number = agent.max_consecutive_failures || 5
  const currentHealth: HealthStatus = agent.health_status || 'healthy'

  let newFailures: number
  let newSuccesses: number
  let newHealth: HealthStatus

  if (outcome.success) {
    newFailures = 0
    newSuccesses = currentSuccesses + 1

    // Recovery is slower than degradation
    // 3 consecutive successes: failing → degraded
    // 5 more consecutive successes: degraded → healthy
    if (currentHealth === 'failing' && newSuccesses >= 3) {
      newHealth = 'degraded'
      console.log(`[Annealing] Agent ${outcome.agentId} recovering: failing → degraded (${newSuccesses} successes)`)
    } else if (currentHealth === 'degraded' && newSuccesses >= 5) {
      newHealth = 'healthy'
      console.log(`[Annealing] Agent ${outcome.agentId} recovered: degraded → healthy (${newSuccesses} successes)`)
    } else {
      newHealth = currentHealth
    }
  } else {
    newFailures = currentFailures + 1
    newSuccesses = 0

    // Degradation is fast
    if (newFailures >= maxFailures) {
      newHealth = 'failing'
      console.log(`[Annealing] Agent ${outcome.agentId} degraded: → failing (${newFailures} failures)`)
    } else if (newFailures >= Math.ceil(maxFailures / 2)) {
      newHealth = 'degraded'
      console.log(`[Annealing] Agent ${outcome.agentId} degraded: → degraded (${newFailures} failures)`)
    } else {
      newHealth = currentHealth
    }
  }

  const { error: updateErr } = await supabase!
    .from('agent_personas')
    .update({
      consecutive_failures: newFailures,
      consecutive_successes: newSuccesses,
      health_status: newHealth,
      last_execution_at: new Date().toISOString(),
    })
    .eq('id', outcome.agentId)

  if (updateErr) {
    console.error('[Annealing] Failed to update agent streaks:', updateErr.message)
  }
}

// ─── Autonomy Auto-Adjustment ────────────────────────────────────────────────

/**
 * Auto-adjust autonomy level based on trust score.
 * Respects manual overrides - only adjusts when no override is set.
 */
async function autoAdjustAutonomy(agentId: string, accountId: string): Promise<void> {
  // Fetch current override status
  const { data: agent, error } = await supabase!
    .from('agent_personas')
    .select('autonomy_level, autonomy_override')
    .eq('id', agentId)
    .single()

  if (error || !agent) return

  // If user has a manual override, respect it
  if (agent.autonomy_override) return

  // Compute fresh trust score
  const trust = await computeTrustScore(agentId, accountId)

  // Only update if recommended level differs from current
  if (trust.recommendedAutonomy !== agent.autonomy_level) {
    const { error: updateErr } = await supabase!
      .from('agent_personas')
      .update({ autonomy_level: trust.recommendedAutonomy })
      .eq('id', agentId)

    if (!updateErr) {
      console.log(`[Annealing] Auto-adjusted autonomy for ${agentId}: ${agent.autonomy_level} → ${trust.recommendedAutonomy}`)
    }
  }
}

// ─── Execution Metadata ──────────────────────────────────────────────────────

/**
 * Store tools_used and cost on the execution record for future analysis.
 */
async function updateExecutionMetadata(outcome: ExecutionOutcome): Promise<void> {
  const { error } = await supabase!
    .from('task_executions')
    .update({
      tools_used: outcome.toolsUsed,
      cost_cents: estimateCostCents(outcome.inputTokens, outcome.outputTokens),
      plan_pattern_key: outcome.patternKey || null,
    })
    .eq('id', outcome.executionId)

  if (error) {
    console.warn('[Annealing] Failed to update execution metadata:', error.message)
  }
}

/**
 * Simple cost estimation based on token usage.
 * Uses rough average pricing across providers.
 */
function estimateCostCents(inputTokens: number, outputTokens: number): number {
  // ~$3/M input, ~$15/M output (Claude Sonnet-level pricing)
  const inputCost = (inputTokens / 1_000_000) * 300
  const outputCost = (outputTokens / 1_000_000) * 1500
  return Math.round(inputCost + outputCost)
}

// ─── Plan Pattern Learning ───────────────────────────────────────────────────

/**
 * Update plan pattern success/failure statistics.
 * This is how the system "remembers" what works.
 */
async function updatePlanPattern(outcome: ExecutionOutcome): Promise<void> {
  if (!outcome.patternKey) return

  const toolNames = outcome.toolsUsed.map(t => t.name).filter(Boolean)

  try {
    // Try to upsert the pattern
    const { data: existing } = await supabase!
      .from('plan_patterns')
      .select('id, total_executions, successful_executions, avg_duration_ms, avg_cost_cents')
      .eq('account_id', outcome.accountId)
      .eq('pattern_key', outcome.patternKey)
      .single()

    if (existing) {
      // Update existing pattern
      const total = existing.total_executions + 1
      const successful = existing.successful_executions + (outcome.success ? 1 : 0)
      const successRate = successful / total

      // Running average for duration and cost
      const costCents = estimateCostCents(outcome.inputTokens, outcome.outputTokens)
      const avgDuration = Math.round(
        (existing.avg_duration_ms * existing.total_executions + outcome.durationMs) / total
      )
      const avgCost = Math.round(
        (existing.avg_cost_cents * existing.total_executions + costCents) / total
      )

      await supabase!
        .from('plan_patterns')
        .update({
          total_executions: total,
          successful_executions: successful,
          success_rate: successRate,
          avg_duration_ms: avgDuration,
          avg_cost_cents: avgCost,
          last_executed_at: new Date().toISOString(),
          last_success: outcome.success,
          tools_used: toolNames,
        })
        .eq('id', existing.id)
    } else {
      // Insert new pattern
      await supabase!
        .from('plan_patterns')
        .insert({
          account_id: outcome.accountId,
          pattern_key: outcome.patternKey,
          total_executions: 1,
          successful_executions: outcome.success ? 1 : 0,
          success_rate: outcome.success ? 1.0 : 0.0,
          avg_duration_ms: outcome.durationMs,
          avg_cost_cents: estimateCostCents(outcome.inputTokens, outcome.outputTokens),
          tools_used: toolNames,
          last_executed_at: new Date().toISOString(),
          last_success: outcome.success,
        })
    }
  } catch (err) {
    console.warn('[Annealing] Failed to update plan pattern:', err)
  }
}
