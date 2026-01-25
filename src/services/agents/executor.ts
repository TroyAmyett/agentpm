// Agent Executor Service
// Executes tasks using Claude API based on agent persona and skill
// Supports tool use for real-time capabilities

import type { Task, AgentPersona, Skill } from '@/types/agentpm'
import { fetchWithRetry } from './apiRetry'
import {
  getAvailableTools,
  getToolDefinitions,
  processToolUses,
  type ToolDefinition,
  type ToolUseRequest,
  type ToolResultMessage,
} from '@/services/tools'

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY as string

// Maximum tool use iterations to prevent infinite loops
const MAX_TOOL_ITERATIONS = 10

export interface ExecutionInput {
  task: Task
  agent: AgentPersona
  skill?: Skill
  additionalContext?: string
  accountId?: string // Required for tool execution
  enableTools?: boolean // Enable tool use (default: true)
}

export interface ToolUsage {
  name: string
  input: Record<string, unknown>
  success: boolean
  error?: string
}

export interface ExecutionResult {
  success: boolean
  content: string
  metadata: {
    model: string
    inputTokens: number
    outputTokens: number
    durationMs: number
    toolsUsed?: ToolUsage[]
    toolIterations?: number
  }
  error?: string
}

export type ExecutionStatusCallback = (
  status: 'building_prompt' | 'calling_api' | 'processing' | 'using_tools',
  detail?: string
) => void

// Build system prompt from agent persona
function buildAgentSystemPrompt(agent: AgentPersona, skill?: Skill, hasTools = false): string {
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

  // Tool instructions
  if (hasTools) {
    parts.push(`\n\n== TOOLS ==`)
    parts.push(`You have access to tools that can help you complete tasks more accurately.`)
    parts.push(`Use tools when you need real-time information, verification, or external data.`)
    parts.push(`For example:`)
    parts.push(`- Use check_domain_availability to verify if domain names are actually available`)
    parts.push(`- Use dns_lookup to check DNS records`)
    parts.push(`- Use fetch_url to read content from web pages`)
    parts.push(`Always use relevant tools before making claims that require verification.`)
    parts.push(`== END TOOLS ==`)
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
  const enableTools = input.enableTools !== false
  const accountId = input.accountId || ''

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

    // Get available tools for this account
    let tools: ToolDefinition[] = []
    if (enableTools && accountId) {
      const availableTools = getAvailableTools(accountId, true)
      tools = getToolDefinitions(availableTools)
      console.log(`[Executor] ${tools.length} tools available for execution`)
    }

    const hasTools = tools.length > 0
    const systemPrompt = buildAgentSystemPrompt(input.agent, input.skill, hasTools)
    const userPrompt = buildTaskPrompt(input.task, input.additionalContext)

    // Track tool usage across iterations
    const toolsUsed: ToolUsage[] = []
    let totalInputTokens = 0
    let totalOutputTokens = 0
    let iterations = 0

    // Build initial messages
    type MessageContent = string | Array<{ type: string; text?: string; tool_use_id?: string; content?: string; is_error?: boolean; id?: string; name?: string; input?: Record<string, unknown> }>
    const messages: Array<{ role: string; content: MessageContent }> = [
      { role: 'user', content: userPrompt }
    ]

    // Tool use loop
    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations++
      onStatusChange?.('calling_api', iterations > 1 ? `iteration ${iterations}` : undefined)

      const requestBody: Record<string, unknown> = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        system: systemPrompt,
        messages,
      }

      // Add tools if available
      if (hasTools) {
        requestBody.tools = tools
      }

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
          body: JSON.stringify(requestBody),
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error?.message || `API error: ${response.status}`)
      }

      const data = await response.json()
      totalInputTokens += data.usage?.input_tokens || 0
      totalOutputTokens += data.usage?.output_tokens || 0

      // Check if Claude wants to use tools
      const toolUseBlocks = (data.content || []).filter(
        (block: { type: string }) => block.type === 'tool_use'
      ) as ToolUseRequest[]

      if (toolUseBlocks.length > 0 && data.stop_reason === 'tool_use') {
        // Claude wants to use tools
        onStatusChange?.('using_tools', toolUseBlocks.map((t: ToolUseRequest) => t.name).join(', '))
        console.log(`[Executor] Claude requesting tools: ${toolUseBlocks.map((t: ToolUseRequest) => t.name).join(', ')}`)

        // Execute the tools
        const toolResults = await processToolUses(toolUseBlocks, accountId)

        // Track tool usage
        for (let i = 0; i < toolUseBlocks.length; i++) {
          toolsUsed.push({
            name: toolUseBlocks[i].name,
            input: toolUseBlocks[i].input,
            success: !toolResults[i].is_error,
            error: toolResults[i].is_error ? toolResults[i].content : undefined,
          })
        }

        // Add assistant's response (with tool_use blocks) to messages
        messages.push({
          role: 'assistant',
          content: data.content,
        })

        // Add tool results to messages
        messages.push({
          role: 'user',
          content: toolResults.map((result: ToolResultMessage) => ({
            type: 'tool_result',
            tool_use_id: result.tool_use_id,
            content: result.content,
            is_error: result.is_error,
          })),
        })

        // Continue loop to get Claude's response with tool results
        continue
      }

      // Claude returned a final response (no more tool use)
      onStatusChange?.('processing')

      // Extract text content from response
      const textBlocks = (data.content || []).filter(
        (block: { type: string }) => block.type === 'text'
      )
      const content = textBlocks.map((block: { text: string }) => block.text).join('\n')

      return {
        success: true,
        content,
        metadata: {
          model: data.model || 'claude-sonnet-4-20250514',
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          durationMs: Date.now() - startTime,
          toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
          toolIterations: iterations > 1 ? iterations : undefined,
        },
      }
    }

    // If we exit the loop, we hit max iterations
    return {
      success: false,
      content: '',
      metadata: {
        model: 'claude-sonnet-4-20250514',
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        durationMs: Date.now() - startTime,
        toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
        toolIterations: iterations,
      },
      error: `Max tool iterations (${MAX_TOOL_ITERATIONS}) exceeded`,
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
export function previewExecution(input: ExecutionInput): {
  systemPrompt: string
  userPrompt: string
  toolsAvailable: string[]
} {
  const accountId = input.accountId || ''
  const enableTools = input.enableTools !== false
  const tools = enableTools && accountId
    ? getAvailableTools(accountId, true)
    : []

  return {
    systemPrompt: buildAgentSystemPrompt(input.agent, input.skill, tools.length > 0),
    userPrompt: buildTaskPrompt(input.task, input.additionalContext),
    toolsAvailable: tools.map(t => t.name),
  }
}
