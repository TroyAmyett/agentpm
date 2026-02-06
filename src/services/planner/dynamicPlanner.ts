// Dynamic Planner - Generates action plans from goals
// Uses LLM to create optimal step sequences based on available agents,
// tools, trust scores, and historical pattern success.
// Falls back to existing decomposition if LLM is unavailable.

import type { Task, AgentPersona, AutonomyLevel } from '@/types/agentpm'
import { resolveFailoverChain, chatWithFailover, type LLMMessage } from '@/services/llm'
import { computeTrustScore, computeConfidence } from '@/services/trust'
import type { TrustScore, ConfidenceResult, PlanForConfidence } from '@/services/trust'
import { getToolsForAgent } from '@/services/tools/agentToolBindings'
import { supabase } from '@/services/supabase/client'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PlanStep {
  title: string
  description: string
  agentId: string
  agentAlias: string
  agentType: string
  toolsRequired: string[]
  dependsOnIndex?: number
}

export interface ExecutionPlan {
  steps: PlanStep[]
  confidence: ConfidenceResult
  executionMode: 'auto' | 'plan-then-execute' | 'step-by-step'
  patternKey: string
  reasoning: string
}

// ─── Pattern Key Generation ──────────────────────────────────────────────────

/**
 * Generate a pattern key from plan steps for pattern matching.
 * Hashes the sorted agent types + tool names + step count.
 */
function generatePatternKey(steps: PlanStep[]): string {
  const agentTypes = [...new Set(steps.map(s => s.agentType))].sort()
  const tools = [...new Set(steps.flatMap(s => s.toolsRequired))].sort()
  return `${agentTypes.join(',')}|${tools.join(',')}|${steps.length}`
}

// ─── Agent Inventory for Prompt ──────────────────────────────────────────────

interface AgentInventory {
  agent: AgentPersona
  trust: TrustScore
  tools: string[]
}

async function buildAgentInventory(
  agents: AgentPersona[],
  accountId: string
): Promise<AgentInventory[]> {
  const available = agents.filter(
    a => a.isActive && !a.pausedAt && a.healthStatus !== 'stopped' && a.agentType !== 'orchestrator'
  )

  const inventory: AgentInventory[] = []
  for (const agent of available) {
    const trust = await computeTrustScore(agent.id, accountId)
    const tools = getToolsForAgent(agent)
    inventory.push({ agent, trust, tools })
  }

  return inventory
}

function formatInventoryForPrompt(inventory: AgentInventory[]): string {
  return inventory.map(({ agent, trust, tools }) => {
    const trustPct = (trust.overallScore * 100).toFixed(0)
    const recentPct = (trust.recentSuccessRate * 100).toFixed(0)
    return `Agent: ${agent.alias} (${agent.agentType})
  ID: ${agent.id}
  Trust: ${trustPct}% | Recent: ${recentPct}% | Health: ${trust.healthStatus}
  Executions: ${trust.totalExecutions}
  Tools: ${tools.join(', ') || 'none'}
  Capabilities: ${agent.capabilities?.join(', ') || 'general'}
  ${agent.description || agent.tagline || ''}`
  }).join('\n\n')
}

// ─── Fetch Historical Patterns ───────────────────────────────────────────────

async function fetchTopPatterns(accountId: string): Promise<string> {
  if (!supabase) return ''

  const { data: patterns } = await supabase
    .from('plan_patterns')
    .select('pattern_key, success_rate, total_executions, agent_types, tools_used, step_count')
    .eq('account_id', accountId)
    .gte('total_executions', 2)
    .order('success_rate', { ascending: false })
    .limit(5)

  if (!patterns || patterns.length === 0) return ''

  const lines = patterns.map(p =>
    `Pattern: ${p.agent_types?.join(' → ') || p.pattern_key} (${p.step_count} steps) | Success: ${((p.success_rate || 0) * 100).toFixed(0)}% over ${p.total_executions} runs`
  )

  return `\nHistorical patterns that worked well:\n${lines.join('\n')}`
}

// ─── Dynamic Plan Generation ─────────────────────────────────────────────────

/**
 * Generate an execution plan for a task using LLM analysis.
 * Considers agent trust scores, available tools, and historical patterns.
 * Returns null if planning fails (caller should fall back to decomposition).
 */
export async function generatePlan(
  task: Task,
  agents: AgentPersona[],
  accountId: string
): Promise<ExecutionPlan | null> {
  // Build agent inventory with trust scores
  const inventory = await buildAgentInventory(agents, accountId)

  if (inventory.length === 0) {
    console.warn('[Planner] No available agents for planning')
    return null
  }

  // Quick heuristic: if task is very simple (short title, no multi-step indicators),
  // skip LLM planning and return a single-step plan
  const taskText = `${task.title} ${task.description || ''}`.toLowerCase()
  const multiStepIndicators = [
    ' and ', ' then ', ', then ', ' after that', ' followed by',
    ' also ', ' plus ', ' additionally ', ' as well as',
  ]
  const hasMultipleActions = (taskText.match(
    /\b(create|write|generate|make|build|post|publish|send|research|analyze)\b/g
  ) || []).length > 1
  const hasMultiStepIndicators = multiStepIndicators.some(i => taskText.includes(i))

  // For simple single-action tasks, create a direct single-step plan
  if (!hasMultipleActions && !hasMultiStepIndicators) {
    return createSingleStepPlan(task, inventory, accountId)
  }

  // Try LLM-based planning for complex tasks
  const resolved = await resolveFailoverChain('planning')
  if (resolved.chain.length === 0) {
    // Fall back to heuristic planning
    return createHeuristicPlan(task, inventory, accountId)
  }

  try {
    const historicalPatterns = await fetchTopPatterns(accountId)

    const systemPrompt = `You are Atlas, an AI orchestrator that creates execution plans for tasks.

Given a goal and available agents with their trust scores, create an optimal step-by-step plan.

Available Agents:
${formatInventoryForPrompt(inventory)}
${historicalPatterns}

Rules:
- Assign steps to SPECIFIC agents by their ID (use the most trusted agent that has the right tools)
- Each step should be achievable by a single agent with its available tools
- List the tools each step will need (from the agent's tool list)
- Use dependsOnIndex when one step needs output from a previous step (0-based index)
- Prefer agents with higher trust scores and relevant tool experience
- Keep plans concise: 1-4 steps. Don't over-decompose simple tasks.
- If only one step is needed, return a single-step plan.

Respond with ONLY valid JSON:
{
  "steps": [
    {
      "title": "Short step title",
      "description": "What this step should accomplish",
      "agentId": "uuid-of-agent",
      "agentAlias": "agent-name",
      "agentType": "agent-type",
      "toolsRequired": ["tool_name"],
      "dependsOnIndex": null
    }
  ],
  "reasoning": "Why this plan was chosen"
}`

    const userPrompt = `Create a plan for this task:

Title: ${task.title}
Description: ${task.description || 'No description'}
Priority: ${task.priority || 'medium'}`

    const messages: LLMMessage[] = [{ role: 'user', content: userPrompt }]

    const { response } = await chatWithFailover(
      { chain: resolved.chain },
      messages,
      { system: systemPrompt, maxTokens: 1000 }
    )

    const content = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text || '')
      .join('')

    // Parse JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('[Planner] Could not parse LLM plan response')
      return createHeuristicPlan(task, inventory, accountId)
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      steps: PlanStep[]
      reasoning: string
    }

    // Validate agent IDs exist in inventory
    const validSteps = parsed.steps.filter(step => {
      const found = inventory.find(i => i.agent.id === step.agentId)
      if (!found) {
        // Try to find by alias or type
        const byAlias = inventory.find(i =>
          i.agent.alias.toLowerCase() === (step.agentAlias || '').toLowerCase()
        )
        const byType = inventory.find(i => i.agent.agentType === step.agentType)
        const fallback = byAlias || byType || inventory[0]
        if (fallback) {
          step.agentId = fallback.agent.id
          step.agentAlias = fallback.agent.alias
          step.agentType = fallback.agent.agentType
          return true
        }
        return false
      }
      return true
    })

    if (validSteps.length === 0) {
      console.warn('[Planner] No valid steps after validation')
      return createHeuristicPlan(task, inventory, accountId)
    }

    const patternKey = generatePatternKey(validSteps)

    // Compute confidence
    const planForConfidence: PlanForConfidence = {
      steps: validSteps.map(s => ({
        agentId: s.agentId,
        toolsRequired: s.toolsRequired || [],
        dependsOnIndex: s.dependsOnIndex,
      })),
      patternKey,
      estimatedCostCents: validSteps.length * 5, // rough estimate
    }

    // Build override map from agent personas
    const overrides = new Map<string, AutonomyLevel>()
    for (const { agent } of inventory) {
      if (agent.autonomyOverride) {
        overrides.set(agent.id, agent.autonomyOverride)
      }
    }

    const confidence = await computeConfidence(planForConfidence, accountId, overrides)

    return {
      steps: validSteps,
      confidence,
      executionMode: confidence.executionMode,
      patternKey,
      reasoning: parsed.reasoning || 'LLM-generated plan',
    }
  } catch (err) {
    console.error('[Planner] LLM planning failed:', err)
    return createHeuristicPlan(task, inventory, accountId)
  }
}

// ─── Fallback: Single-Step Plan ──────────────────────────────────────────────

async function createSingleStepPlan(
  task: Task,
  inventory: AgentInventory[],
  accountId: string
): Promise<ExecutionPlan> {
  // Pick the best agent based on trust and type matching
  const best = pickBestAgent(task, inventory)

  const step: PlanStep = {
    title: task.title,
    description: task.description || task.title,
    agentId: best.agent.id,
    agentAlias: best.agent.alias,
    agentType: best.agent.agentType,
    toolsRequired: best.tools,
  }

  const patternKey = generatePatternKey([step])

  const planForConfidence: PlanForConfidence = {
    steps: [{ agentId: step.agentId, toolsRequired: step.toolsRequired }],
    patternKey,
    estimatedCostCents: 5,
  }

  const overrides = new Map<string, AutonomyLevel>()
  if (best.agent.autonomyOverride) {
    overrides.set(best.agent.id, best.agent.autonomyOverride)
  }

  const confidence = await computeConfidence(planForConfidence, accountId, overrides)

  return {
    steps: [step],
    confidence,
    executionMode: confidence.executionMode,
    patternKey,
    reasoning: `Single-step task assigned to ${best.agent.alias} (trust: ${(best.trust.overallScore * 100).toFixed(0)}%)`,
  }
}

// ─── Fallback: Heuristic Plan ────────────────────────────────────────────────

async function createHeuristicPlan(
  task: Task,
  inventory: AgentInventory[],
  accountId: string
): Promise<ExecutionPlan> {
  const text = `${task.title} ${task.description || ''}`.toLowerCase()
  const steps: PlanStep[] = []

  // Pattern detection
  const hasWriting = /\b(write|create|draft|compose)\s+(a\s+)?(blog|article|post|content|copy)/i.test(text)
  const hasImage = /\b(create|generate|make|design)\s+(a\s+)?(image|graphic|visual|illustration|logo|banner)/i.test(text)
  const hasResearch = /\b(research|investigate|analyze|find|gather)/i.test(text)
  const hasCode = /\b(code|develop|implement|build|fix)/i.test(text)

  if (hasResearch) {
    const agent = findAgentByType(inventory, 'researcher')
    if (agent) {
      steps.push({
        title: 'Research phase',
        description: 'Gather information and research relevant topics',
        agentId: agent.agent.id,
        agentAlias: agent.agent.alias,
        agentType: agent.agent.agentType,
        toolsRequired: ['web_search', 'fetch_url'].filter(t => agent.tools.includes(t)),
      })
    }
  }

  if (hasWriting) {
    const agent = findAgentByType(inventory, 'content-writer')
    if (agent) {
      steps.push({
        title: 'Create content',
        description: 'Write the content based on requirements',
        agentId: agent.agent.id,
        agentAlias: agent.agent.alias,
        agentType: agent.agent.agentType,
        toolsRequired: ['publish_blog_post'].filter(t => agent.tools.includes(t)),
        dependsOnIndex: steps.length > 0 ? 0 : undefined,
      })
    }
  }

  if (hasImage) {
    const agent = findAgentByType(inventory, 'image-generator') ||
                  findAgentByType(inventory, 'content-writer')
    if (agent) {
      steps.push({
        title: 'Generate image',
        description: 'Create visual assets',
        agentId: agent.agent.id,
        agentAlias: agent.agent.alias,
        agentType: agent.agent.agentType,
        toolsRequired: ['generate_image'].filter(t => agent.tools.includes(t)),
        dependsOnIndex: hasWriting ? steps.length - 1 : undefined,
      })
    }
  }

  if (hasCode) {
    const agent = findAgentByType(inventory, 'forge')
    if (agent) {
      steps.push({
        title: 'Development',
        description: 'Implement the technical requirements',
        agentId: agent.agent.id,
        agentAlias: agent.agent.alias,
        agentType: agent.agent.agentType,
        toolsRequired: agent.tools,
        dependsOnIndex: steps.length > 0 ? steps.length - 1 : undefined,
      })
    }
  }

  // If no patterns matched, fall back to single-step
  if (steps.length === 0) {
    return createSingleStepPlan(task, inventory, accountId)
  }

  const patternKey = generatePatternKey(steps)

  const planForConfidence: PlanForConfidence = {
    steps: steps.map(s => ({
      agentId: s.agentId,
      toolsRequired: s.toolsRequired,
      dependsOnIndex: s.dependsOnIndex,
    })),
    patternKey,
    estimatedCostCents: steps.length * 5,
  }

  const overrides = new Map<string, AutonomyLevel>()
  for (const { agent } of inventory) {
    if (agent.autonomyOverride) overrides.set(agent.id, agent.autonomyOverride)
  }

  const confidence = await computeConfidence(planForConfidence, accountId, overrides)

  return {
    steps,
    confidence,
    executionMode: confidence.executionMode,
    patternKey,
    reasoning: `Heuristic plan: ${steps.map(s => s.title).join(' → ')}`,
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function findAgentByType(inventory: AgentInventory[], agentType: string): AgentInventory | undefined {
  // Prefer highest trust agent of the requested type
  return inventory
    .filter(i => i.agent.agentType === agentType)
    .sort((a, b) => b.trust.overallScore - a.trust.overallScore)[0]
}

function pickBestAgent(task: Task, inventory: AgentInventory[]): AgentInventory {
  const text = `${task.title} ${task.description || ''}`.toLowerCase()

  // Keyword-based type matching
  const typeScores: Record<string, number> = {
    'content-writer': 0,
    'image-generator': 0,
    'researcher': 0,
    'qa-tester': 0,
    'forge': 0,
  }

  const keywords: Record<string, string[]> = {
    'content-writer': ['write', 'article', 'blog', 'content', 'copy', 'post', 'email'],
    'image-generator': ['image', 'photo', 'picture', 'graphic', 'design', 'visual'],
    'researcher': ['research', 'find', 'search', 'analyze', 'investigate', 'report'],
    'qa-tester': ['test', 'qa', 'quality', 'bug', 'verify'],
    'forge': ['code', 'develop', 'build', 'implement', 'fix', 'feature', 'api'],
  }

  for (const [type, words] of Object.entries(keywords)) {
    for (const word of words) {
      if (text.includes(word)) typeScores[type]++
    }
  }

  // Find best matching type
  const bestType = Object.entries(typeScores)
    .sort(([, a], [, b]) => b - a)
    .find(([type]) => inventory.some(i => i.agent.agentType === type))?.[0]

  if (bestType) {
    const match = findAgentByType(inventory, bestType)
    if (match) return match
  }

  // Default to highest trust agent
  return inventory.sort((a, b) => b.trust.overallScore - a.trust.overallScore)[0]
}
