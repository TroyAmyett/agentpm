// Dispatcher Service - Smart task routing to agents
// Analyzes tasks and assigns to the best-suited agent based on capabilities
// Supports multi-step task decomposition for complex workflows

import type { Task, AgentPersona } from '@/types/agentpm'
import { fetchWithRetry } from './apiRetry'

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY as string

export interface RoutingDecision {
  agentId: string
  agentAlias: string
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
}

export interface RoutingInput {
  task: Task
  agents: AgentPersona[]
}

// Multi-step task decomposition
export interface TaskStep {
  title: string
  description: string
  agentType: string
  dependsOnIndex?: number // Index of step this depends on (0-based)
}

export interface DecompositionResult {
  isMultiStep: boolean
  steps: TaskStep[]
  reasoning: string
}

// Build agent descriptions for the routing prompt
function buildAgentDescriptions(agents: AgentPersona[]): string {
  return agents
    .filter((a) => a.isActive && !a.pausedAt && a.healthStatus !== 'stopped')
    .map((agent) => {
      const caps = agent.capabilities?.length
        ? `Capabilities: ${agent.capabilities.join(', ')}`
        : ''
      const restrictions = agent.restrictions?.length
        ? `Restrictions: ${agent.restrictions.join(', ')}`
        : ''

      return `
Agent: ${agent.alias}
ID: ${agent.id}
Type: ${agent.agentType}
${agent.description || agent.tagline || ''}
${caps}
${restrictions}
`.trim()
    })
    .join('\n\n---\n\n')
}

// Route a task to the best agent using AI analysis
export async function routeTask(input: RoutingInput): Promise<RoutingDecision | null> {
  const { task, agents } = input

  // Filter to available agents (active, not paused, healthy)
  const availableAgents = agents.filter(
    (a) => a.isActive && !a.pausedAt && a.healthStatus !== 'stopped' && a.agentType !== 'orchestrator'
  )

  if (availableAgents.length === 0) {
    console.warn('No available agents for routing')
    return null
  }

  // If only one agent available, use it
  if (availableAgents.length === 1) {
    return {
      agentId: availableAgents[0].id,
      agentAlias: availableAgents[0].alias,
      confidence: 'high',
      reasoning: 'Only one agent available',
    }
  }

  if (!ANTHROPIC_API_KEY) {
    // Fallback: simple keyword matching
    return fallbackRouting(task, availableAgents)
  }

  try {
    const systemPrompt = `You are Dispatch, an AI orchestrator responsible for routing tasks to the right agent.

Analyze the task and select the BEST agent to handle it based on their capabilities and specializations.

Available Agents:
${buildAgentDescriptions(availableAgents)}

Respond with ONLY valid JSON in this exact format:
{
  "agentId": "uuid-of-selected-agent",
  "agentAlias": "name-of-agent",
  "confidence": "high" | "medium" | "low",
  "reasoning": "Brief explanation of why this agent was chosen"
}

Select the agent whose capabilities best match the task requirements. Consider:
- Agent specialization (content-writer for writing, researcher for research, etc.)
- Task description keywords
- Required skills mentioned in the task`

    const userPrompt = `Route this task to the best agent:

Title: ${task.title}
Description: ${task.description || 'No description'}
Priority: ${task.priority}
${task.input ? `Additional Context: ${JSON.stringify(task.input)}` : ''}`

    const response = await fetchWithRetry(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      }
    )

    if (!response.ok) {
      console.error('Routing API error:', response.status)
      return fallbackRouting(task, availableAgents)
    }

    const data = await response.json()
    const content = data.content?.[0]?.text || ''

    // Parse JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('Could not parse routing response')
      return fallbackRouting(task, availableAgents)
    }

    const decision = JSON.parse(jsonMatch[0]) as RoutingDecision

    // Validate the agent ID exists
    const selectedAgent = availableAgents.find((a) => a.id === decision.agentId)
    if (!selectedAgent) {
      console.error('Routing selected invalid agent:', decision.agentId)
      return fallbackRouting(task, availableAgents)
    }

    return decision
  } catch (error) {
    console.error('Routing error:', error)
    return fallbackRouting(task, availableAgents)
  }
}

// Fallback routing using keyword matching
function fallbackRouting(task: Task, agents: AgentPersona[]): RoutingDecision {
  const text = `${task.title} ${task.description || ''}`.toLowerCase()

  // Keyword matching for agent types
  const keywordMap: Record<string, string[]> = {
    'content-writer': ['write', 'article', 'blog', 'content', 'copy', 'post', 'email', 'newsletter'],
    'image-generator': ['image', 'photo', 'picture', 'graphic', 'design', 'visual', 'illustration'],
    'researcher': ['research', 'find', 'search', 'analyze', 'investigate', 'report', 'data'],
    'qa-tester': ['test', 'qa', 'quality', 'bug', 'verify', 'validate', 'check'],
    'forge': ['code', 'develop', 'build', 'implement', 'fix', 'feature', 'api', 'database'],
  }

  // Score each agent
  let bestAgent = agents[0]
  let bestScore = 0

  for (const agent of agents) {
    const keywords = keywordMap[agent.agentType] || []
    let score = 0

    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        score++
      }
    }

    // Also check capabilities
    for (const cap of agent.capabilities || []) {
      if (text.includes(cap.toLowerCase())) {
        score += 2
      }
    }

    if (score > bestScore) {
      bestScore = score
      bestAgent = agent
    }
  }

  return {
    agentId: bestAgent.id,
    agentAlias: bestAgent.alias,
    confidence: bestScore > 2 ? 'high' : bestScore > 0 ? 'medium' : 'low',
    reasoning: bestScore > 0
      ? `Matched keywords for ${bestAgent.agentType}`
      : `Default assignment to ${bestAgent.alias}`,
  }
}

// Check if dispatcher is configured
export function isDispatcherConfigured(): boolean {
  return !!ANTHROPIC_API_KEY
}

// Analyze a task to determine if it needs to be decomposed into multiple steps
export async function analyzeTaskForDecomposition(
  task: Task,
  agents: AgentPersona[]
): Promise<DecompositionResult> {
  // Quick check: if task is very short and simple, skip decomposition
  const taskText = `${task.title} ${task.description || ''}`.toLowerCase()
  console.log(`[Decomposition] Analyzing: "${taskText}"`)

  // Heuristic: Look for multi-step indicators
  const multiStepIndicators = [
    ' and ', ' then ', ', then ', ' after that', ' followed by',
    ' also ', ' plus ', ' additionally ', ' as well as',
    'create', 'generate', 'post', 'publish', 'send'
  ]

  const matchedIndicators = multiStepIndicators.filter(i => taskText.includes(i))
  const matchedActions = taskText.match(/\b(create|write|generate|make|build|post|publish|send|research|analyze)\b/g) || []
  const hasMultipleIndicators = matchedIndicators.length >= 2
  const hasMultipleActions = matchedActions.length > 1

  console.log(`[Decomposition] Matched indicators (${matchedIndicators.length}):`, matchedIndicators)
  console.log(`[Decomposition] Matched actions (${matchedActions.length}):`, matchedActions)
  console.log(`[Decomposition] hasMultipleIndicators: ${hasMultipleIndicators}, hasMultipleActions: ${hasMultipleActions}`)

  // If no indicators, return as single-step
  if (!hasMultipleIndicators && !hasMultipleActions) {
    console.log(`[Decomposition] Skipping - no multi-step indicators found`)
    return {
      isMultiStep: false,
      steps: [],
      reasoning: 'Task appears to be a single-step task',
    }
  }

  // If no API key, use fallback decomposition
  if (!ANTHROPIC_API_KEY) {
    return fallbackDecomposition(task, agents)
  }

  try {
    const availableAgentTypes = [...new Set(
      agents
        .filter((a) => a.isActive && !a.pausedAt && a.agentType !== 'orchestrator')
        .map((a) => a.agentType)
    )]

    const systemPrompt = `You are Dispatch, an AI orchestrator that analyzes tasks to determine if they should be broken into multiple steps.

Your job is to:
1. Analyze if the task contains multiple distinct actions that should be done by different agents
2. If yes, break it into ordered steps with dependencies
3. Assign each step to the appropriate agent type

Available agent types: ${availableAgentTypes.join(', ')}

Agent type guidelines:
- content-writer: Writing blog posts, articles, copy, emails
- image-generator: Creating images, graphics, visuals
- researcher: Research, data gathering, analysis
- forge: Code development, technical implementation
- qa-tester: Testing, quality assurance

Respond with ONLY valid JSON:
{
  "isMultiStep": true/false,
  "steps": [
    {
      "title": "Short step title",
      "description": "What this step should accomplish",
      "agentType": "content-writer|image-generator|researcher|forge|etc",
      "dependsOnIndex": null or 0-based index of prerequisite step
    }
  ],
  "reasoning": "Why this decomposition was chosen"
}

Rules:
- Only decompose if the task clearly has multiple distinct deliverables
- Steps should be in logical execution order
- Each step should be assignable to a single agent
- Use dependsOnIndex when one step needs output from another`

    const userPrompt = `Analyze this task for multi-step decomposition:

Title: ${task.title}
Description: ${task.description || 'No description'}`

    const response = await fetchWithRetry(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      }
    )

    if (!response.ok) {
      console.error('Decomposition API error:', response.status)
      return fallbackDecomposition(task, agents)
    }

    const data = await response.json()
    const content = data.content?.[0]?.text || ''

    // Parse JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('Could not parse decomposition response')
      return fallbackDecomposition(task, agents)
    }

    const result = JSON.parse(jsonMatch[0]) as DecompositionResult

    // Validate agent types exist
    if (result.isMultiStep && result.steps.length > 0) {
      for (const step of result.steps) {
        const hasAgent = agents.some(
          (a) => a.agentType === step.agentType && a.isActive && !a.pausedAt
        )
        if (!hasAgent) {
          // Try to find a similar agent
          const fallbackAgent = agents.find((a) => a.isActive && !a.pausedAt && a.agentType !== 'orchestrator')
          if (fallbackAgent) {
            step.agentType = fallbackAgent.agentType
          }
        }
      }
    }

    return result
  } catch (error) {
    console.error('Decomposition error:', error)
    return fallbackDecomposition(task, agents)
  }
}

// Fallback decomposition using pattern matching
function fallbackDecomposition(task: Task, agents: AgentPersona[]): DecompositionResult {
  const text = `${task.title} ${task.description || ''}`.toLowerCase()
  const steps: TaskStep[] = []
  console.log(`[Decomposition Fallback] Analyzing: "${text}"`)

  // Pattern detection
  const hasWriting = /\b(write|create|draft|compose)\s+(a\s+)?(blog|article|post|content|copy)/i.test(text)
  const hasImage = /\b(create|generate|make|design)\s+(a\s+)?(image|graphic|visual|illustration|logo|banner)/i.test(text)
  const hasResearch = /\b(research|investigate|analyze|find|gather)/i.test(text)
  const hasPublish = /\b(post|publish|send|deploy|upload)\s+(to|on)/i.test(text)
  const hasCode = /\b(code|develop|implement|build|fix)/i.test(text)
  console.log(`[Decomposition Fallback] Patterns: writing=${hasWriting}, image=${hasImage}, research=${hasResearch}, publish=${hasPublish}, code=${hasCode}`)

  // Build steps in logical order
  if (hasResearch) {
    steps.push({
      title: 'Research phase',
      description: extractContext(text, 'research'),
      agentType: 'researcher',
    })
  }

  if (hasWriting) {
    steps.push({
      title: 'Create content',
      description: extractContext(text, 'writing'),
      agentType: 'content-writer',
      dependsOnIndex: steps.length > 0 ? 0 : undefined,
    })
  }

  if (hasImage) {
    steps.push({
      title: 'Generate image',
      description: extractContext(text, 'image'),
      agentType: 'image-generator',
      dependsOnIndex: hasWriting ? steps.length - 1 : undefined,
    })
  }

  if (hasCode) {
    steps.push({
      title: 'Development',
      description: extractContext(text, 'code'),
      agentType: 'forge',
      dependsOnIndex: steps.length > 0 ? steps.length - 1 : undefined,
    })
  }

  if (hasPublish && steps.length > 0) {
    steps.push({
      title: 'Publish/Deploy',
      description: extractContext(text, 'publish'),
      agentType: steps[steps.length - 1].agentType, // Same agent as last step
      dependsOnIndex: steps.length - 1,
    })
  }

  // Validate agent types exist
  const availableTypes = new Set(
    agents
      .filter((a) => a.isActive && !a.pausedAt && a.agentType !== 'orchestrator')
      .map((a) => a.agentType)
  )

  for (const step of steps) {
    if (!availableTypes.has(step.agentType)) {
      // Fall back to first available agent
      const fallback = agents.find((a) => a.isActive && !a.pausedAt && a.agentType !== 'orchestrator')
      if (fallback) {
        step.agentType = fallback.agentType
      }
    }
  }

  const result = {
    isMultiStep: steps.length > 1,
    steps,
    reasoning: steps.length > 1
      ? `Detected ${steps.length} distinct phases: ${steps.map((s) => s.title).join(' → ')}`
      : 'Single-step task or unable to decompose',
  }
  console.log(`[Decomposition Fallback] Result: ${steps.length} steps, isMultiStep=${result.isMultiStep}`)
  return result
}

// Helper to extract relevant context for a step
function extractContext(text: string, type: string): string {
  // Simple extraction based on type - could be enhanced with NLP
  switch (type) {
    case 'research':
      return 'Gather information and research relevant topics'
    case 'writing':
      return 'Write the content based on requirements'
    case 'image':
      return 'Create visual assets to accompany the content'
    case 'code':
      return 'Implement the technical requirements'
    case 'publish':
      return 'Publish or deploy the completed work'
    default:
      return text.slice(0, 200)
  }
}
