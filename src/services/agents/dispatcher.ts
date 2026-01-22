// Dispatcher Service - Smart task routing to agents
// Analyzes tasks and assigns to the best-suited agent based on capabilities

import type { Task, AgentPersona } from '@/types/agentpm'

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

    const response = await fetch('https://api.anthropic.com/v1/messages', {
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
    })

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
