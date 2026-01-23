// Agent Executor Service
// Executes tasks using Claude API based on agent persona and skill

import type { Task, AgentPersona, Skill } from '@/types/agentpm'
import { fetchWithRetry } from './apiRetry'

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY as string

export interface ExecutionInput {
  task: Task
  agent: AgentPersona
  skill?: Skill
  additionalContext?: string
}

export interface ExecutionResult {
  success: boolean
  content: string
  metadata: {
    model: string
    inputTokens: number
    outputTokens: number
    durationMs: number
  }
  error?: string
}

export type ExecutionStatusCallback = (status: 'building_prompt' | 'calling_api' | 'processing') => void

// Build system prompt from agent persona
function buildAgentSystemPrompt(agent: AgentPersona, skill?: Skill): string {
  const parts: string[] = []

  // Agent identity
  parts.push(`You are ${agent.alias}, a ${agent.agentType} agent.`)
  if (agent.tagline) {
    parts.push(agent.tagline)
  }
  if (agent.description) {
    parts.push(`\n${agent.description}`)
  }

  // Capabilities
  if (agent.capabilities && agent.capabilities.length > 0) {
    parts.push(`\n\nYour capabilities: ${agent.capabilities.join(', ')}`)
  }

  // Restrictions
  if (agent.restrictions && agent.restrictions.length > 0) {
    parts.push(`\nYou must NOT: ${agent.restrictions.join(', ')}`)
  }

  // Skill-specific instructions
  if (skill) {
    parts.push(`\n\n== SKILL: ${skill.name} ==`)
    if (skill.description) {
      parts.push(skill.description)
    }
    parts.push(`\n${skill.content}`)
    parts.push(`== END SKILL ==`)
  }

  // Output instructions
  parts.push(`\n\nIMPORTANT: Provide your complete output. Be thorough and deliver exactly what the task asks for.`)

  return parts.join('\n')
}

// Build user prompt from task
function buildTaskPrompt(task: Task, additionalContext?: string): string {
  const parts: string[] = []

  parts.push(`# Task: ${task.title}`)

  if (task.description) {
    parts.push(`\n## Description\n${task.description}`)
  }

  if (task.priority) {
    parts.push(`\nPriority: ${task.priority}`)
  }

  if (task.dueAt) {
    parts.push(`Due: ${new Date(task.dueAt).toLocaleDateString()}`)
  }

  if (additionalContext) {
    parts.push(`\n## Additional Context\n${additionalContext}`)
  }

  parts.push(`\n\nPlease complete this task now. Provide your full output.`)

  return parts.join('\n')
}

// Execute a task with an agent
export async function executeTask(
  input: ExecutionInput,
  onStatusChange?: ExecutionStatusCallback
): Promise<ExecutionResult> {
  const startTime = Date.now()

  if (!ANTHROPIC_API_KEY) {
    return {
      success: false,
      content: '',
      metadata: {
        model: 'none',
        inputTokens: 0,
        outputTokens: 0,
        durationMs: Date.now() - startTime,
      },
      error: 'Anthropic API key not configured',
    }
  }

  try {
    onStatusChange?.('building_prompt')

    const systemPrompt = buildAgentSystemPrompt(input.agent, input.skill)
    const userPrompt = buildTaskPrompt(input.task, input.additionalContext)

    onStatusChange?.('calling_api')

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
          max_tokens: 8192,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      }
    )

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error?.message || `API error: ${response.status}`)
    }

    onStatusChange?.('processing')

    const data = await response.json()
    const content = data.content?.[0]?.text || ''

    return {
      success: true,
      content,
      metadata: {
        model: data.model || 'claude-sonnet-4-20250514',
        inputTokens: data.usage?.input_tokens || 0,
        outputTokens: data.usage?.output_tokens || 0,
        durationMs: Date.now() - startTime,
      },
    }
  } catch (error) {
    return {
      success: false,
      content: '',
      metadata: {
        model: 'claude-sonnet-4-20250514',
        inputTokens: 0,
        outputTokens: 0,
        durationMs: Date.now() - startTime,
      },
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// Check if execution is configured
export function isExecutionConfigured(): boolean {
  return !!ANTHROPIC_API_KEY
}

// Get the prompts that would be used (for preview/debugging)
export function previewExecution(input: ExecutionInput): { systemPrompt: string; userPrompt: string } {
  return {
    systemPrompt: buildAgentSystemPrompt(input.agent, input.skill),
    userPrompt: buildTaskPrompt(input.task, input.additionalContext),
  }
}
