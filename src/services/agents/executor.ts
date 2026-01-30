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
import { recordSkillUsage } from '@/services/skills'
import { useApiKeysStore } from '@/stores/apiKeysStore'
import { useAccountStore } from '@/stores/accountStore'
import { useProfileStore } from '@/stores/profileStore'

// Platform API key from environment (for platform-funded tiers)
const PLATFORM_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY as string

// Platform-funded plans that use the platform's API key
const PLATFORM_FUNDED_PLANS = ['free', 'beta', 'trial', 'demo'] as const

/**
 * Check if user's plan is platform-funded (uses platform API key)
 * Based on architecture: free/beta/trial/demo = platform-funded, starter/pro/enterprise = BYOK
 */
function isPlatformFundedPlan(): boolean {
  const accountStore = useAccountStore.getState()
  const profileStore = useProfileStore.getState()

  // Super admins always get platform-funded access
  if (profileStore.profile?.isSuperAdmin) {
    console.log('[Executor] Super admin - using platform-funded access')
    return true
  }

  // Check account plan
  const account = accountStore.currentAccount()
  const plan = account?.plan || 'free'

  // Free plan and demo accounts are platform-funded
  if (PLATFORM_FUNDED_PLANS.includes(plan as typeof PLATFORM_FUNDED_PLANS[number])) {
    return true
  }

  // Demo/default accounts are platform-funded
  if (account?.id?.startsWith('default-') || account?.slug === 'demo') {
    return true
  }

  return false
}

/**
 * Get user's stored Anthropic API key
 */
async function getUserApiKey(userId: string): Promise<string | null> {
  const store = useApiKeysStore.getState()

  // Make sure keys are loaded
  if (store.keys.length === 0) {
    await store.fetchKeys(userId)
  }

  // Find a valid Anthropic key
  const anthropicKey = store.keys.find(
    k => k.provider === 'anthropic' && k.isValid
  )

  if (anthropicKey) {
    const decrypted = await store.getDecryptedKey(anthropicKey.id)
    if (decrypted) {
      return decrypted
    }
  }

  return null
}

/**
 * Get API key for execution based on subscription tier
 *
 * Strategy (per architecture/TIER-MODEL.md):
 * - Platform-funded tiers (free, demo, super admin): Use PLATFORM_API_KEY
 * - BYOK tiers (starter, professional, enterprise): Use user's stored key
 */
async function getApiKey(userId?: string): Promise<{ key: string | null; source: 'platform' | 'user' | 'none'; error?: string }> {
  const isPlatformFunded = isPlatformFundedPlan()

  if (isPlatformFunded) {
    // Platform-funded: use platform key
    if (PLATFORM_API_KEY) {
      console.log('[Executor] Platform-funded tier - using platform API key')
      return { key: PLATFORM_API_KEY, source: 'platform' }
    }
    // Platform key not configured - this is a deployment issue
    return { key: null, source: 'none', error: 'Platform API key not configured. Please contact support.' }
  }

  // BYOK tier: must use user's stored key
  if (!userId) {
    return { key: null, source: 'none', error: 'User ID required for BYOK tier' }
  }

  const userKey = await getUserApiKey(userId)
  if (userKey) {
    console.log('[Executor] BYOK tier - using user\'s stored Anthropic API key')
    return { key: userKey, source: 'user' }
  }

  // BYOK tier but no key configured
  const account = useAccountStore.getState().currentAccount()
  const planName = account?.plan || 'your'
  return {
    key: null,
    source: 'none',
    error: `Your ${planName} plan requires you to bring your own API key. Please add your Anthropic API key in Settings > API Keys.`
  }
}

// Maximum tool use iterations to prevent infinite loops
const MAX_TOOL_ITERATIONS = 10

export interface ExecutionInput {
  task: Task
  agent: AgentPersona
  skill?: Skill
  additionalContext?: string
  accountId?: string // Required for tool execution
  userId?: string // Required for skill usage tracking
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
function buildAgentSystemPrompt(agent: AgentPersona, skill?: Skill, tools: ToolDefinition[] = []): string {
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

  // Tool instructions - dynamically list all available tools
  if (tools.length > 0) {
    parts.push(`\n\n== TOOLS ==`)
    parts.push(`You have access to ${tools.length} tools. You MUST use the appropriate tools to complete your task - do NOT just write about what you would do, actually DO it using the tools.`)
    parts.push(`\nAvailable tools:`)
    for (const tool of tools) {
      parts.push(`- ${tool.name}: ${tool.description}`)
    }
    parts.push(`\nCRITICAL INSTRUCTIONS:`)
    parts.push(`- When a task involves publishing content (blog posts, landing pages), you MUST use the publish_blog_post or create_landing_page tool to actually publish it. Do not just write the content as text output.`)
    parts.push(`- When a task involves creating images, use the generate_image tool.`)
    parts.push(`- When a task requires research or web content, use fetch_url or web_search.`)
    parts.push(`- When a task involves domain names, use check_domain_availability and dns_lookup.`)
    parts.push(`- Always EXECUTE the action using tools rather than describing what could be done.`)
    parts.push(`- If a tool fails, report the error clearly so it can be fixed.`)
    parts.push(`== END TOOLS ==`)
  }

  // Output instructions
  parts.push(`\n\nIMPORTANT: Provide your complete output. Be thorough and deliver exactly what the task asks for. If you have tools available, USE them to take real action - don't just describe what you would do.`)

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

  // Get API key based on subscription tier
  const { key: apiKey, source: keySource, error: keyError } = await getApiKey(input.userId)

  if (!apiKey) {
    return {
      success: false,
      content: '',
      metadata: {
        model: 'none',
        inputTokens: 0,
        outputTokens: 0,
        durationMs: Date.now() - startTime,
      },
      error: keyError || 'No Anthropic API key configured.',
    }
  }

  console.log(`[Executor] Using ${keySource} API key for execution`)

  try {
    onStatusChange?.('building_prompt')

    // Get available tools for this account
    let tools: ToolDefinition[] = []
    if (enableTools && accountId) {
      const availableTools = getAvailableTools(accountId, true)
      tools = getToolDefinitions(availableTools)
      console.log(`[Executor] ${tools.length} tools available for execution`)
    }

    const systemPrompt = buildAgentSystemPrompt(input.agent, input.skill, tools)
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
      if (tools.length > 0) {
        requestBody.tools = tools
      }

      const response = await fetchWithRetry(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
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

      const result: ExecutionResult = {
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

      // Track skill usage if a skill was used
      if (input.skill && accountId && input.userId) {
        try {
          await recordSkillUsage({
            accountId,
            skillId: input.skill.id,
            taskId: input.task.id,
            agentId: input.agent.id,
            userId: input.userId,
            success: true,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            durationMs: Date.now() - startTime,
            modelUsed: data.model || 'claude-sonnet-4-20250514',
            toolsUsed: toolsUsed.map(t => ({ name: t.name, success: t.success })),
          })
        } catch (trackingError) {
          console.warn('[Executor] Failed to track skill usage:', trackingError)
        }
      }

      return result
    }

    // If we exit the loop, we hit max iterations
    const maxIterResult: ExecutionResult = {
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

    // Track skill usage for max iterations exceeded
    if (input.skill && accountId && input.userId) {
      try {
        await recordSkillUsage({
          accountId,
          skillId: input.skill.id,
          taskId: input.task.id,
          agentId: input.agent.id,
          userId: input.userId,
          success: false,
          errorMessage: maxIterResult.error,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          durationMs: Date.now() - startTime,
          modelUsed: 'claude-sonnet-4-20250514',
          toolsUsed: toolsUsed.map(t => ({ name: t.name, success: t.success })),
        })
      } catch (trackingError) {
        console.warn('[Executor] Failed to track skill usage:', trackingError)
      }
    }

    return maxIterResult
  } catch (error) {
    const errorResult: ExecutionResult = {
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

    // Track skill usage for errors
    if (input.skill && accountId && input.userId) {
      try {
        await recordSkillUsage({
          accountId,
          skillId: input.skill.id,
          taskId: input.task.id,
          agentId: input.agent.id,
          userId: input.userId,
          success: false,
          errorMessage: errorResult.error,
          inputTokens: 0,
          outputTokens: 0,
          durationMs: Date.now() - startTime,
          modelUsed: 'claude-sonnet-4-20250514',
          toolsUsed: [],
        })
      } catch (trackingError) {
        console.warn('[Executor] Failed to track skill usage:', trackingError)
      }
    }

    return errorResult
  }
}

// Check if execution is configured (sync check)
// For platform-funded tiers, checks platform key
// For BYOK tiers, returns true (actual key check happens at execution time)
export function isExecutionConfigured(): boolean {
  // If platform-funded, check platform key
  if (isPlatformFundedPlan()) {
    return !!PLATFORM_API_KEY
  }
  // For BYOK tiers, assume configured (will check user key at execution)
  return true
}

// Async check that verifies actual key availability based on tier
export async function isExecutionConfiguredAsync(userId?: string): Promise<boolean> {
  const { key } = await getApiKey(userId)
  return !!key
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
    systemPrompt: buildAgentSystemPrompt(input.agent, input.skill, getToolDefinitions(tools)),
    userPrompt: buildTaskPrompt(input.task, input.additionalContext),
    toolsAvailable: tools.map(t => t.name),
  }
}
