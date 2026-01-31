// Trust Engine - Computes trust scores from real execution data
// Foundation for confidence-based execution and self-annealing autonomy

import type { AutonomyLevel, HealthStatus } from '@/types/agentpm'
import { supabase } from '@/services/supabase/client'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TrustScore {
  agentId: string
  overallScore: number           // 0.0-1.0 weighted composite
  successRate: number            // All-time from task_executions
  recentSuccessRate: number      // Last 20 executions
  consecutiveFailures: number
  consecutiveSuccesses: number
  totalExecutions: number
  toolFamiliarity: Record<string, number> // toolName -> 0.0-1.0
  recommendedAutonomy: AutonomyLevel
  healthStatus: HealthStatus
}

export interface ConfidenceFactors {
  agentTrust: number           // 0.40 weight
  planComplexity: number       // 0.20 weight
  toolFamiliarity: number      // 0.15 weight
  patternMatch: number         // 0.15 weight
  costRisk: number             // 0.10 weight
}

export interface ConfidenceResult {
  score: number
  level: 'high' | 'medium' | 'low'
  executionMode: 'auto' | 'plan-then-execute' | 'step-by-step'
  factors: ConfidenceFactors
  reasoning: string
}

export interface PlanForConfidence {
  steps: Array<{
    agentId: string
    toolsRequired: string[]
    dependsOnIndex?: number
  }>
  patternKey: string
  estimatedCostCents: number
}

// ─── Trust Score Computation ─────────────────────────────────────────────────

/**
 * Compute a trust score for an agent based on real execution history.
 * Returns a neutral score (0.75) when no execution data exists (trust by default).
 */
export async function computeTrustScore(
  agentId: string,
  _accountId: string
): Promise<TrustScore> {
  const neutral: TrustScore = {
    agentId,
    overallScore: 0.75,
    successRate: 1.0,
    recentSuccessRate: 1.0,
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
    totalExecutions: 0,
    toolFamiliarity: {},
    recommendedAutonomy: 'semi-autonomous',
    healthStatus: 'healthy',
  }

  if (!supabase) return neutral

  try {
    // Fetch all executions for this agent (most recent first)
    const { data: executions, error } = await supabase
      .from('task_executions')
      .select('id, status, tools_used, started_at, completed_at, cost_cents')
      .eq('agent_id', agentId)
      .in('status', ['completed', 'failed'])
      .order('created_at', { ascending: false })
      .limit(100)

    if (error || !executions || executions.length === 0) {
      return neutral
    }

    // All-time success rate
    const totalExecutions = executions.length
    const successCount = executions.filter(e => e.status === 'completed').length
    const successRate = successCount / totalExecutions

    // Recent success rate (last 20)
    const recent = executions.slice(0, 20)
    const recentSuccess = recent.filter(e => e.status === 'completed').length
    const recentSuccessRate = recentSuccess / recent.length

    // Consecutive failures/successes (from most recent)
    let consecutiveFailures = 0
    let consecutiveSuccesses = 0
    for (const exec of executions) {
      if (exec.status === 'completed') {
        if (consecutiveFailures > 0) break
        consecutiveSuccesses++
      } else {
        if (consecutiveSuccesses > 0) break
        consecutiveFailures++
      }
    }

    // Tool familiarity: count tool successes across all executions
    const toolSuccesses: Record<string, number> = {}
    const toolAttempts: Record<string, number> = {}

    for (const exec of executions) {
      const tools = (exec.tools_used || []) as Array<{ name: string; success: boolean }>
      for (const tool of tools) {
        if (!tool.name) continue
        toolAttempts[tool.name] = (toolAttempts[tool.name] || 0) + 1
        if (tool.success !== false) {
          toolSuccesses[tool.name] = (toolSuccesses[tool.name] || 0) + 1
        }
      }
    }

    const toolFamiliarity: Record<string, number> = {}
    for (const toolName of Object.keys(toolAttempts)) {
      toolFamiliarity[toolName] = (toolSuccesses[toolName] || 0) / toolAttempts[toolName]
    }

    // Failure recency: how recent was the last failure? (0 = just now, 1 = far ago)
    const failureIndex = executions.findIndex(e => e.status === 'failed')
    const failureRecency = failureIndex === -1 ? 1.0 : Math.min(failureIndex / 10, 1.0)

    // Average tool familiarity
    const toolFamiliarityValues = Object.values(toolFamiliarity)
    const avgToolFamiliarity = toolFamiliarityValues.length > 0
      ? toolFamiliarityValues.reduce((a, b) => a + b, 0) / toolFamiliarityValues.length
      : 0.5

    // Overall score computation
    const overallScore = Math.min(1.0, Math.max(0.0,
      0.35 * recentSuccessRate +
      0.25 * successRate +
      0.20 * failureRecency +
      0.10 * avgToolFamiliarity +
      0.10 * 0.5 // patternSuccess placeholder (computed separately in confidence)
    ))

    // Recommended autonomy based on trust score
    const recommendedAutonomy: AutonomyLevel =
      overallScore >= 0.85 ? 'autonomous' :
      overallScore >= 0.60 ? 'semi-autonomous' :
      'supervised'

    // Health status based on failure streaks
    const healthStatus: HealthStatus =
      consecutiveFailures >= 5 ? 'failing' :
      consecutiveFailures >= 3 ? 'degraded' :
      'healthy'

    return {
      agentId,
      overallScore,
      successRate,
      recentSuccessRate,
      consecutiveFailures,
      consecutiveSuccesses,
      totalExecutions,
      toolFamiliarity,
      recommendedAutonomy,
      healthStatus,
    }
  } catch (err) {
    console.error('[TrustEngine] Error computing trust score:', err)
    return neutral
  }
}

// ─── Tool Familiarity ────────────────────────────────────────────────────────

/**
 * Get familiarity score for specific tools the agent will need.
 * Returns 0.5 (neutral) for tools never used before.
 */
export async function getToolFamiliarity(
  agentId: string,
  toolNames: string[],
  accountId: string
): Promise<number> {
  if (toolNames.length === 0) return 1.0

  const trust = await computeTrustScore(agentId, accountId)
  const scores = toolNames.map(name => trust.toolFamiliarity[name] ?? 0.5)
  return scores.reduce((a, b) => a + b, 0) / scores.length
}

// ─── Pattern Success ─────────────────────────────────────────────────────────

/**
 * Fetch the success rate for a known plan pattern.
 * Returns null if pattern has never been seen.
 */
export async function getPatternSuccess(
  patternKey: string,
  accountId: string
): Promise<{ successRate: number; totalExecutions: number } | null> {
  if (!supabase) return null

  try {
    const { data, error } = await supabase
      .from('plan_patterns')
      .select('success_rate, total_executions')
      .eq('account_id', accountId)
      .eq('pattern_key', patternKey)
      .single()

    if (error || !data) return null
    return {
      successRate: Number(data.success_rate),
      totalExecutions: data.total_executions,
    }
  } catch {
    return null
  }
}

// ─── Confidence Computation ──────────────────────────────────────────────────

/**
 * Compute confidence for a plan, determining the execution mode.
 * Takes into account agent trust, plan complexity, tool familiarity,
 * historical pattern success, and cost risk.
 */
export async function computeConfidence(
  plan: PlanForConfidence,
  accountId: string,
  agentOverrides?: Map<string, AutonomyLevel>
): Promise<ConfidenceResult> {
  // 1. Agent Trust (40% weight) - average trust of all agents in the plan
  const uniqueAgentIds = [...new Set(plan.steps.map(s => s.agentId))]
  const trustScores = await Promise.all(
    uniqueAgentIds.map(id => computeTrustScore(id, accountId))
  )
  const trustMap = new Map(trustScores.map(t => [t.agentId, t]))
  const agentTrust = trustScores.length > 0
    ? trustScores.reduce((sum, t) => sum + t.overallScore, 0) / trustScores.length
    : 0.75

  // 2. Plan Complexity (20% weight) - simpler plans = higher confidence
  const stepCount = plan.steps.length
  const hasDependencies = plan.steps.some(s => s.dependsOnIndex !== undefined)
  const planComplexity = Math.max(0, 1 - (stepCount - 1) * 0.15 - (hasDependencies ? 0.1 : 0))

  // 3. Tool Familiarity (15% weight) - experience with required tools
  const toolScores = await Promise.all(
    plan.steps.map(async (step) => {
      if (step.toolsRequired.length === 0) return 1.0
      const trust = trustMap.get(step.agentId)
      if (!trust) return 0.5
      const scores = step.toolsRequired.map(t => trust.toolFamiliarity[t] ?? 0.5)
      return scores.reduce((a, b) => a + b, 0) / scores.length
    })
  )
  const toolFamiliarity = toolScores.length > 0
    ? toolScores.reduce((a, b) => a + b, 0) / toolScores.length
    : 0.5

  // 4. Pattern Match (15% weight) - has this plan pattern worked before?
  const pattern = await getPatternSuccess(plan.patternKey, accountId)
  const patternMatch = pattern ? pattern.successRate : 0.5 // neutral if no history

  // 5. Cost Risk (10% weight) - lower cost = higher confidence
  const cost = plan.estimatedCostCents
  const costRisk = cost < 10 ? 1.0 : cost < 100 ? 0.8 : cost < 500 ? 0.5 : 0.3

  // Weighted composite
  const score = Math.min(1.0, Math.max(0.0,
    0.40 * agentTrust +
    0.20 * planComplexity +
    0.15 * toolFamiliarity +
    0.15 * patternMatch +
    0.10 * costRisk
  ))

  // Check for user autonomy overrides that cap confidence
  let cappedLevel: 'high' | 'medium' | 'low' | null = null

  for (const step of plan.steps) {
    // Check manual override first
    const override = agentOverrides?.get(step.agentId)
    if (override === 'supervised') {
      cappedLevel = 'low'
      break
    }
    if (override === 'semi-autonomous') {
      cappedLevel = 'medium'
    }

    // Also check trust-recommended autonomy
    const trust = trustMap.get(step.agentId)
    if (trust?.recommendedAutonomy === 'supervised') {
      cappedLevel = 'low'
      break
    }
  }

  const computedLevel: 'high' | 'medium' | 'low' =
    score >= 0.80 ? 'high' :
    score >= 0.50 ? 'medium' :
    'low'

  // Apply cap: only downgrade, never upgrade
  const levelOrder = { low: 0, medium: 1, high: 2 }
  const effectiveLevel = cappedLevel && levelOrder[cappedLevel] < levelOrder[computedLevel]
    ? cappedLevel
    : computedLevel

  const executionMode: 'auto' | 'plan-then-execute' | 'step-by-step' =
    effectiveLevel === 'high' ? 'auto' :
    effectiveLevel === 'medium' ? 'plan-then-execute' :
    'step-by-step'

  const factors: ConfidenceFactors = {
    agentTrust,
    planComplexity,
    toolFamiliarity,
    patternMatch,
    costRisk,
  }

  // Build reasoning string
  const parts: string[] = []
  if (agentTrust >= 0.8) parts.push('strong agent track record')
  else if (agentTrust < 0.5) parts.push('low agent trust')
  if (patternMatch >= 0.8) parts.push('proven plan pattern')
  else if (pattern === null) parts.push('new plan pattern')
  if (stepCount > 3) parts.push(`complex plan (${stepCount} steps)`)
  if (cappedLevel) parts.push(`capped by autonomy override`)

  return {
    score,
    level: effectiveLevel,
    executionMode,
    factors,
    reasoning: parts.length > 0
      ? `Confidence ${(score * 100).toFixed(0)}%: ${parts.join(', ')}`
      : `Confidence ${(score * 100).toFixed(0)}%`,
  }
}
