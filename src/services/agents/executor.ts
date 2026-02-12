// Agent Executor Service
// Executes tasks using LLM API based on agent persona and skill
// Supports tool use for real-time capabilities
// LLM-agnostic: uses provider abstraction layer

import type { Task, AgentPersona, Skill } from '@/types/agentpm'
import {
  getAvailableTools,
  processToolUses,
  type Tool,
  type ToolUseRequest,
  type ToolResultMessage,
} from '@/services/tools'
import { recordSkillUsage, fetchSkills } from '@/services/skills'
import {
  resolveFailoverChain,
  chatWithFailover,
  isLLMConfigured,
  type LLMConfig,
  type LLMMessage,
  type LLMContentBlock,
  type LLMToolDefinition,
  type LLMResponse,
  type FailoverResult,
} from '@/services/llm'
import { getToolsForAgent } from '@/services/tools/agentToolBindings'
import { logLLMCall, logToolCall, logExecutionError } from '@/services/audit'
import { createClientFromConfig, type OpenClawResponse } from '@/services/openclaw/client'
import { createClient } from '@supabase/supabase-js'

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
  executionId?: string // For audit trail correlation
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
function buildAgentSystemPrompt(
  agent: AgentPersona,
  skill?: Skill,
  tools: LLMToolDefinition[] = [],
  availableSkills: Skill[] = [],
): string {
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

  // Available skills catalog — lets the agent know what reusable skills exist
  const hasCreateSkill = tools.some(t => t.name === 'create_skill')
  if (availableSkills.length > 0 || hasCreateSkill) {
    parts.push(`\n\n== SKILLS CATALOG ==`)
    if (availableSkills.length > 0) {
      parts.push(`The following reusable skills are available in this workspace:`)
      for (const s of availableSkills.slice(0, 30)) {
        const desc = s.description ? ` — ${s.description}` : ''
        parts.push(`- ${s.name} [${s.category}]${desc}`)
      }
    }
    if (hasCreateSkill) {
      parts.push(`\n**Skill Discovery**: If this task requires a repeatable process and no existing skill covers it, use the \`create_skill\` tool to create a new reusable skill. A good skill is a reusable prompt template that can be applied to similar tasks in the future. Include clear instructions, expected inputs, and output format.`)
      parts.push(`**Naming convention**: Agent-created skills MUST use the \`my-\` prefix (e.g. "my-seo-blog-post", "my-competitor-analysis", "my-product-launch-checklist"). Official \`fun-\` and \`@fun/\` prefixes are reserved for Funnelists-authored skills.`)
      parts.push(`Only create a skill when the task represents a pattern worth reusing — don't create skills for one-off requests.`)
    }
    parts.push(`== END SKILLS CATALOG ==`)
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
    parts.push(`- "Publishing" means using a tool to deploy content to funnelists.com. Choose the right tool:`)
    parts.push(`  - Blog posts, articles, thought leadership → use publish_blog_post (commits to CMS, auto-deploys via Vercel)`)
    parts.push(`  - Landing pages, lead capture, waitlist, product pages → use create_landing_page`)
    parts.push(`  - Do NOT just write content as text output. Actually publish it with the tool.`)
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

/**
 * Convert Tool objects to LLMToolDefinition format
 */
function toLLMToolDefs(tools: Tool[]): LLMToolDefinition[] {
  return tools.map(t => ({
    name: t.definition.name,
    description: t.definition.description,
    parameters: t.definition.input_schema as LLMToolDefinition['parameters'],
  }))
}

// Execute a task with an agent
export async function executeTask(
  input: ExecutionInput,
  onStatusChange?: ExecutionStatusCallback
): Promise<ExecutionResult> {
  const startTime = Date.now()
  const enableTools = input.enableTools !== false
  const accountId = input.accountId || ''

  // ── External runtime routing ──────────────────────────────────────
  // If agent is configured for external execution, delegate to OpenClaw
  if (input.agent.executionRuntime === 'external') {
    return executeExternalTask(input, startTime, onStatusChange)
  }

  // Resolve failover chain (ordered list of provider configs) based on tier
  const resolved = await resolveFailoverChain('task-execution', input.userId)

  if (resolved.chain.length === 0) {
    return {
      success: false,
      content: '',
      metadata: {
        model: 'none',
        inputTokens: 0,
        outputTokens: 0,
        durationMs: Date.now() - startTime,
      },
      error: resolved.error || 'No LLM API key configured.',
    }
  }

  const config = resolved.chain[0] // Primary config (for logging/audit)
  const keySource = resolved.source
  console.log(`[Executor] Using ${keySource} ${config.provider} key (model: ${config.model}), ${resolved.chain.length} provider(s) in failover chain`)

  // Skill provider compatibility check
  if (input.skill?.compatibleProviders && input.skill.compatibleProviders.length > 0) {
    const compatible = input.skill.compatibleProviders
    if (!compatible.includes('universal') && !compatible.includes(config.provider as typeof compatible[number])) {
      console.warn(`[Executor] Skill "${input.skill.name}" is not compatible with provider "${config.provider}" (requires: ${compatible.join(', ')})`)
    }
  }

  try {
    onStatusChange?.('building_prompt')

    // Get available tools filtered by agent type
    let tools: Tool[] = []
    if (enableTools && accountId) {
      const allowedToolNames = getToolsForAgent(input.agent)
      const allTools = getAvailableTools(accountId, true)
      tools = allowedToolNames.length > 0
        ? allTools.filter(tool => allowedToolNames.includes(tool.name))
        : allTools  // If no bindings defined, allow all (backward compat)

      // Skill tool binding: ensure required tools are included
      if (input.skill?.requiredTools && input.skill.requiredTools.length > 0) {
        const toolNames = new Set(tools.map(t => t.name))
        const missing = input.skill.requiredTools.filter(name => !toolNames.has(name))
        if (missing.length > 0) {
          // Add missing required tools from the full set
          const extraTools = allTools.filter(t => missing.includes(t.name))
          tools = [...tools, ...extraTools]
          if (extraTools.length < missing.length) {
            const stillMissing = missing.filter(name => !allTools.some(t => t.name === name))
            console.warn(`[Executor] Skill "${input.skill.name}" requires tools not available: ${stillMissing.join(', ')}`)
          }
        }
      }

      console.log(`[Executor] ${tools.length} tools available for ${input.agent.alias} (${input.agent.agentType})`)
    }

    // Fetch available skills for the skills catalog (non-blocking, best-effort)
    let availableSkills: Skill[] = []
    if (accountId) {
      try {
        availableSkills = await fetchSkills(accountId)
        console.log(`[Executor] ${availableSkills.length} skills in catalog for skill discovery`)
      } catch (err) {
        console.warn('[Executor] Failed to fetch skills catalog (non-fatal):', err)
      }
    }

    const llmToolDefs = toLLMToolDefs(tools)
    const systemPrompt = buildAgentSystemPrompt(input.agent, input.skill, llmToolDefs, availableSkills)
    const userPrompt = buildTaskPrompt(input.task, input.additionalContext)

    // Track tool usage across iterations
    const toolsUsed: ToolUsage[] = []
    let totalInputTokens = 0
    let totalOutputTokens = 0
    let iterations = 0
    let activeConfig: LLMConfig = config // Track which config actually served

    // Build initial messages in universal format
    const messages: LLMMessage[] = [
      { role: 'user', content: userPrompt }
    ]

    // Tool use loop
    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations++
      onStatusChange?.('calling_api', iterations > 1 ? `iteration ${iterations}` : undefined)

      const iterationStart = Date.now()
      const failoverResult: FailoverResult = await chatWithFailover(
        { chain: resolved.chain },
        messages,
        {
          system: systemPrompt,
          tools: llmToolDefs.length > 0 ? llmToolDefs : undefined,
          maxTokens: 8192,
        }
      )
      const response: LLMResponse = failoverResult.response
      const iterationDurationMs = Date.now() - iterationStart

      // Track which provider actually served this iteration
      activeConfig = resolved.chain[failoverResult.servedBy.attempt - 1] || config
      if (failoverResult.servedBy.wasFallback) {
        console.log(`[Executor] Failover: served by ${failoverResult.servedBy.provider}/${failoverResult.servedBy.model} (attempt ${failoverResult.servedBy.attempt})`)
      }

      totalInputTokens += response.usage.inputTokens
      totalOutputTokens += response.usage.outputTokens

      // Audit: log each LLM call
      if (accountId) {
        logLLMCall({
          executionId: input.executionId,
          accountId,
          agentId: input.agent.id,
          taskId: input.task.id,
          provider: failoverResult.servedBy.provider,
          model: response.model || failoverResult.servedBy.model,
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          durationMs: iterationDurationMs,
          stepIndex: iterations,
        })
      }

      // Check if LLM wants to use tools
      const toolUseBlocks = response.content.filter(
        (block: LLMContentBlock) => block.type === 'tool_use'
      )

      if (toolUseBlocks.length > 0 && response.stopReason === 'tool_use') {
        // LLM wants to use tools
        const toolNames = toolUseBlocks.map((t: LLMContentBlock) => t.toolName || 'unknown').join(', ')
        onStatusChange?.('using_tools', toolNames)
        console.log(`[Executor] LLM requesting tools: ${toolNames}`)

        // Convert LLM tool blocks to ToolUseRequest format
        const toolUseRequests: ToolUseRequest[] = toolUseBlocks.map((block: LLMContentBlock) => ({
          type: 'tool_use' as const,
          id: block.toolCallId || `tool_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name: block.toolName || '',
          input: (block.toolInput || {}) as Record<string, unknown>,
        }))

        // Execute the tools
        const toolExecStart = Date.now()
        const toolResults = await processToolUses(toolUseRequests, accountId)
        const toolExecDuration = Date.now() - toolExecStart

        // Track tool usage and audit log each tool call
        for (let i = 0; i < toolUseRequests.length; i++) {
          const success = !toolResults[i].is_error
          toolsUsed.push({
            name: toolUseRequests[i].name,
            input: toolUseRequests[i].input,
            success,
            error: toolResults[i].is_error ? toolResults[i].content : undefined,
          })

          // Audit: log each tool invocation
          if (accountId) {
            logToolCall({
              executionId: input.executionId,
              accountId,
              agentId: input.agent.id,
              taskId: input.task.id,
              toolName: toolUseRequests[i].name,
              toolInput: toolUseRequests[i].input,
              toolOutput: toolResults[i].content,
              toolSuccess: success,
              durationMs: Math.round(toolExecDuration / toolUseRequests.length),
              stepIndex: iterations,
            })
          }
        }

        // Add assistant's response to messages (with tool_use blocks)
        messages.push({
          role: 'assistant',
          content: response.content,
        })

        // Add tool results to messages
        messages.push({
          role: 'user',
          content: toolResults.map((result: ToolResultMessage) => ({
            type: 'tool_result' as const,
            toolCallId: result.tool_use_id,
            text: result.content,
            isError: result.is_error,
          })),
        })

        // Continue loop to get LLM's response with tool results
        continue
      }

      // LLM returned a final response (no more tool use)
      onStatusChange?.('processing')

      // Extract text content from response
      const textBlocks = response.content.filter(
        (block: LLMContentBlock) => block.type === 'text'
      )
      const content = textBlocks.map((block: LLMContentBlock) => block.text || '').join('\n')

      const result: ExecutionResult = {
        success: true,
        content,
        metadata: {
          model: response.model || activeConfig.model,
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
            modelUsed: response.model || activeConfig.model,
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
        model: config.model,
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
          modelUsed: config.model,
          toolsUsed: toolsUsed.map(t => ({ name: t.name, success: t.success })),
        })
      } catch (trackingError) {
        console.warn('[Executor] Failed to track skill usage:', trackingError)
      }
    }

    return maxIterResult
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const errorResult: ExecutionResult = {
      success: false,
      content: '',
      metadata: {
        model: config.model,
        inputTokens: 0,
        outputTokens: 0,
        durationMs: Date.now() - startTime,
      },
      error: errorMessage,
    }

    // Audit: log execution error
    if (accountId) {
      logExecutionError({
        executionId: input.executionId,
        accountId,
        agentId: input.agent.id,
        taskId: input.task.id,
        errorMessage,
      })
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
          modelUsed: config.model,
          toolsUsed: [],
        })
      } catch (trackingError) {
        console.warn('[Executor] Failed to track skill usage:', trackingError)
      }
    }

    return errorResult
  }
}

// ── External Runtime Execution ──────────────────────────────────────────────
// Routes task to an external agent runtime (e.g., OpenClaw) instead of the LLM

async function executeExternalTask(
  input: ExecutionInput,
  startTime: number,
  onStatusChange?: ExecutionStatusCallback,
): Promise<ExecutionResult> {
  const accountId = input.accountId || ''
  const agent = input.agent

  onStatusChange?.('building_prompt', 'Connecting to external runtime')

  // Resolve the channel config for this external agent
  const channelId = agent.externalChannelId
  if (!channelId) {
    return {
      success: false,
      content: '',
      metadata: { model: 'external', inputTokens: 0, outputTokens: 0, durationMs: Date.now() - startTime },
      error: `Agent "${agent.alias}" is set to external runtime but has no externalChannelId configured.`,
    }
  }

  const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL || '',
    import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  )

  const { data: channel, error: channelErr } = await supabase
    .from('intake_channels')
    .select('id, config, is_active')
    .eq('id', channelId)
    .eq('channel_type', 'openclaw')
    .is('deleted_at', null)
    .single()

  if (channelErr || !channel) {
    return {
      success: false,
      content: '',
      metadata: { model: 'external', inputTokens: 0, outputTokens: 0, durationMs: Date.now() - startTime },
      error: `External channel ${channelId} not found or not an OpenClaw channel.`,
    }
  }

  if (!channel.is_active) {
    return {
      success: false,
      content: '',
      metadata: { model: 'external', inputTokens: 0, outputTokens: 0, durationMs: Date.now() - startTime },
      error: `External channel is inactive. Enable it in Settings > Channels.`,
    }
  }

  const config = channel.config as Record<string, unknown>
  const client = createClientFromConfig(config)

  if (!client) {
    return {
      success: false,
      content: '',
      metadata: { model: 'external', inputTokens: 0, outputTokens: 0, durationMs: Date.now() - startTime },
      error: `OpenClaw channel is missing runtime_url or auth_token.`,
    }
  }

  onStatusChange?.('calling_api', 'Sending task to OpenClaw')

  // Build the task message for OpenClaw
  const taskMessage = buildTaskPrompt(input.task, input.additionalContext)
  const agentName = (config.default_agent as string) || agent.alias || 'main'

  const result: OpenClawResponse = await client.sendTask(agentName, taskMessage, {
    agentpm_task_id: input.task.id,
    agentpm_agent_id: agent.id,
    skill: input.skill?.name,
  })

  const durationMs = Date.now() - startTime

  if (!result.success) {
    if (accountId) {
      logExecutionError({
        executionId: input.executionId,
        accountId,
        agentId: agent.id,
        taskId: input.task.id,
        errorMessage: result.error || 'External execution failed',
      })
    }

    return {
      success: false,
      content: '',
      metadata: { model: 'external:openclaw', inputTokens: 0, outputTokens: 0, durationMs },
      error: result.error || 'OpenClaw execution failed',
    }
  }

  console.log(`[Executor] External task sent to OpenClaw agent "${agentName}" (session: ${result.sessionId})`)

  return {
    success: true,
    content: result.response || `Task delegated to OpenClaw agent "${agentName}". Session: ${result.sessionId || 'N/A'}. Results will be reported back via callback.`,
    metadata: {
      model: 'external:openclaw',
      inputTokens: 0,
      outputTokens: 0,
      durationMs,
    },
  }
}

// Check if execution is configured (sync check)
export function isExecutionConfigured(): boolean {
  return isLLMConfigured()
}

// Async check that verifies actual key availability based on tier
export async function isExecutionConfiguredAsync(userId?: string): Promise<boolean> {
  const resolved = await resolveFailoverChain('task-execution', userId)
  return resolved.chain.length > 0
}

// Get the prompts that would be used (for preview/debugging)
export function previewExecution(input: ExecutionInput): {
  systemPrompt: string
  userPrompt: string
  toolsAvailable: string[]
} {
  const accountId = input.accountId || ''
  const enableTools = input.enableTools !== false

  let tools: Tool[] = []
  if (enableTools && accountId) {
    const allowedToolNames = getToolsForAgent(input.agent)
    const allTools = getAvailableTools(accountId, true)
    tools = allowedToolNames.length > 0
      ? allTools.filter(tool => allowedToolNames.includes(tool.name))
      : allTools
  }

  return {
    systemPrompt: buildAgentSystemPrompt(input.agent, input.skill, toLLMToolDefs(tools)),
    userPrompt: buildTaskPrompt(input.task, input.additionalContext),
    toolsAvailable: tools.map(t => t.name),
  }
}
