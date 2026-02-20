// Agent Executor Service
// Executes tasks using LLM API based on agent persona and skill
// Supports tool use for real-time capabilities
// LLM-agnostic: uses provider abstraction layer

import type { Task, AgentPersona, Skill, OrchestratorConfig, OrchestratorPlan } from '@/types/agentpm'
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
import { filterToolRequests } from '@/services/agents/guardrails'
import { createTaskTool } from '@/services/tools/implementations/orchestratorTools'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '@/services/supabase/client'

// Maximum tool use iterations to prevent infinite loops (per agent type)
const DEFAULT_MAX_ITERATIONS = 15
const MAX_ITERATIONS_BY_AGENT_TYPE: Record<string, number> = {
  'orchestrator': 25,  // needs many rounds: plan + create multiple subtasks + monitor
  'researcher': 20,    // search → fetch → refine → fetch → synthesize
  'content-writer': 15,
  'forge': 20,         // dev agent: multi-step code generation
}

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
  status: 'building_prompt' | 'calling_api' | 'processing' | 'using_tools' | 'creating_subtasks',
  detail?: string
) => void

interface OrchestratorPromptContext {
  config: OrchestratorConfig
  workerAgents: Array<{ id: string; alias: string; agentType: string; capabilities: string[] }>
  task: Task
  planApproved: boolean
  approvedPlan?: OrchestratorPlan
}

// Build system prompt from agent persona
function buildAgentSystemPrompt(
  agent: AgentPersona,
  skill?: Skill,
  tools: LLMToolDefinition[] = [],
  availableSkills: Skill[] = [],
  orchestratorCtx?: OrchestratorPromptContext,
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
    parts.push(`- "Publishing" means using a tool to create content on funnelists.com. All content is created as DRAFT — only admins can publish. Choose the right tool:`)
    parts.push(`  - Blog posts, articles, thought leadership → use publish_blog_post with pageType="blog" (appears at /insights/{slug} after admin publishes)`)
    parts.push(`  - Generic website pages → use publish_blog_post with pageType="page" (appears at /{slug} after admin publishes)`)
    parts.push(`  - Landing pages with structured layout (hero, sections, pricing) → use create_landing_page`)
    parts.push(`  - Do NOT just write content as text output. Actually publish it with the tool.`)
    parts.push(`- When a task involves creating images, use the generate_image tool.`)
    parts.push(`- When a task requires research or web content, use fetch_url or web_search.`)
    parts.push(`- When a task involves domain names, use check_domain_availability and dns_lookup.`)
    parts.push(`- For blog posts: ALWAYS generate a hero image FIRST using generate_image, then pass the returned imageUrl as heroImageUrl to publish_blog_post. Do NOT skip the image.`)
    parts.push(`- Always EXECUTE the action using tools rather than describing what could be done.`)
    parts.push(`- If a tool fails, report the error clearly so it can be fixed.`)
    parts.push(`== END TOOLS ==`)
  }

  // Company context — agents must know what Funnelists is and sells
  parts.push(`\n\n== COMPANY CONTEXT ==`)
  parts.push(`You work for **Funnelists** (funnelists.com), an AI-powered SaaS company.`)
  parts.push(`\n**What Funnelists sells:**`)
  parts.push(`- **AgentPM** — AI project management with autonomous agents that execute tasks`)
  parts.push(`- **Radar** — AI-powered source intelligence and competitive monitoring`)
  parts.push(`- **Canvas** — AI image generation with brand theming`)
  parts.push(`- **BookIt** — AI calendar scheduling and meeting booking`)
  parts.push(`- **TimeChain** — Time tracking and invoicing`)
  parts.push(`- **LeadGen** — AI lead generation and prospecting`)
  parts.push(`- **Funnelists CMS** — Marketing site and content platform`)
  parts.push(`\n**Target audience:** SMBs, agencies, solo entrepreneurs, and marketing teams who need AI-powered automation.`)
  parts.push(`**Brand voice:** Professional but approachable. Tech-savvy, practical, results-focused. Emphasis on AI agents doing real work, not just chatbots.`)
  parts.push(`**Founder:** Troy Amyett — Salesforce Agentforce Specialist (9 certifications), based in Hollywood, Florida.`)
  parts.push(`**Key differentiator:** Real AI agents that take action (publish content, generate images, manage projects) vs. chatbots that just talk.`)
  parts.push(`\nALL content you create must be relevant to Funnelists products, target audience, or the AI/marketing/SaaS industry. Never write generic content.`)
  parts.push(`== END COMPANY CONTEXT ==`)

  // ── Orchestrator Protocol ─────────────────────────────────────────
  if (agent.agentType === 'orchestrator' && orchestratorCtx) {
    const { config, workerAgents, planApproved, approvedPlan } = orchestratorCtx

    parts.push(`\n\n== ORCHESTRATOR PROTOCOL ==`)
    parts.push(`You are Atlas, the task orchestrator. Your job is to ensure every task gets done well.`)
    parts.push(`You are the single front door — every task comes to you first.`)

    parts.push(`\n## Your Process`)
    parts.push(`1. READ the task carefully. Understand what the human wants.`)
    parts.push(`2. CHECK capabilities — do we have the right agents, skills, and tools?`)
    parts.push(`3. DECIDE — is this a simple task (1 agent) or complex (decompose)?`)
    parts.push(`4. PLAN — use \`preview_plan\` to build your execution plan.`)
    parts.push(`5. EXECUTE (after approval) — create subtasks, assign agents, set dependencies.`)
    parts.push(`6. MONITOR — check task progress with \`list_tasks\`.`)
    parts.push(`7. DELIVER — when all subtasks complete, compile results and mark the root task completed.`)

    parts.push(`\n## Hard Limits (NEVER exceed)`)
    parts.push(`- Max subtasks per parent: ${config.maxSubtasksPerParent}`)
    parts.push(`- Max total active tasks: ${config.maxTotalActiveTasks}`)
    parts.push(`- Max concurrent agents: ${config.maxConcurrentAgents}`)
    parts.push(`- Max retries per subtask: ${config.maxRetriesPerSubtask}`)
    parts.push(`If a plan would exceed any hard limit, STOP and alert the human.`)

    // Agent roster
    parts.push(`\n## Available Worker Agents`)
    if (workerAgents.length > 0) {
      for (const wa of workerAgents) {
        parts.push(`- **${wa.alias}** (${wa.agentType}, ID: ${wa.id}) — ${wa.capabilities.join(', ')}`)
      }
    } else {
      parts.push(`No worker agents configured. Alert the human.`)
    }

    // Dry run vs execution mode
    if (planApproved && approvedPlan) {
      // Subtasks are auto-created by the executor with correct dependency wiring.
      // This prompt branch is only reached if auto-materialization is somehow skipped.
      parts.push(`\n## MODE: EXECUTE APPROVED PLAN`)
      parts.push(`Subtasks have been automatically created from the approved plan with correct dependency wiring.`)
      parts.push(`Use list_tasks to check their status. Monitor progress and compile the final result when all complete.`)
      parts.push(`\nApproved plan summary: ${approvedPlan.summary}`)
      for (let i = 0; i < approvedPlan.subtasks.length; i++) {
        const s = approvedPlan.subtasks[i]
        const deps = s.dependsOnSteps?.length
          ? ` (after step ${s.dependsOnSteps.map(d => d + 1).join(', ')})`
          : ''
        parts.push(`  ${i + 1}. [${s.assignToAgentType}] ${s.title}${deps}`)
      }
    } else if (planApproved && !approvedPlan) {
      // Plan was approved but the plan data is missing — error state
      parts.push(`\n## ERROR: Plan approved but plan data is missing`)
      parts.push(`The human approved a plan, but the plan could not be found in this task's output.`)
      parts.push(`Use update_task_status to set this task to "failed" with the error message: "Plan data missing after approval — please recreate the task."`)
    } else {
      parts.push(`\n## MODE: DRY RUN (Plan First)`)
      parts.push(`You MUST call \`preview_plan\` FIRST before creating any subtasks.`)
      parts.push(`Analyze the task, determine the best decomposition, and submit the plan.`)
      parts.push(`The human will review and approve before execution proceeds.`)
      parts.push(`\nFor simple tasks (1 agent, 1 skill), you can still create a plan with a single subtask.`)
      parts.push(`For direct delegation (no decomposition needed), create a 1-step plan assigning to the right agent.`)
    }

    parts.push(`\n## Rules`)
    parts.push(`- Never skip the capability check`)
    parts.push(`- Never exceed hard limits`)
    parts.push(`- When creating subtasks, include clear instructions and full context`)
    parts.push(`- If the human uses cancel_tree, stop all work immediately`)
    parts.push(`- Always use the right agent for the job based on their capabilities`)
    parts.push(`== END ORCHESTRATOR PROTOCOL ==`)
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

    // Resolve Google Drive document references in skill content (if any)
    if (input.skill?.content) {
      try {
        const { resolveSkillDocs } = await import('@/services/skills/docResolver')
        input.skill = { ...input.skill, content: await resolveSkillDocs(input.skill.content) }
      } catch (err) {
        console.warn('[Executor] Skill doc resolver failed (non-fatal):', err)
      }
    }

    const llmToolDefs = toLLMToolDefs(tools)

    // ── Orchestrator context ────────────────────────────────────────
    let orchestratorCtx: OrchestratorPromptContext | undefined
    if (input.agent.agentType === 'orchestrator' && supabase && accountId) {
      try {
        // Fetch orchestrator config
        const { data: orchConfigRow } = await supabase
          .from('orchestrator_config')
          .select('*')
          .eq('account_id', accountId)
          .single()

        const orchConfig: OrchestratorConfig = orchConfigRow ? {
          id: orchConfigRow.id,
          accountId: orchConfigRow.account_id,
          orchestratorAgentId: orchConfigRow.orchestrator_agent_id,
          maxDecompositionDepth: orchConfigRow.max_decomposition_depth ?? 1,
          autoDecompose: orchConfigRow.auto_decompose ?? false,
          trustTaskExecution: orchConfigRow.trust_task_execution ?? 0,
          trustDecomposition: orchConfigRow.trust_decomposition ?? 0,
          trustSkillCreation: orchConfigRow.trust_skill_creation ?? 0,
          trustToolUsage: orchConfigRow.trust_tool_usage ?? 0,
          trustContentPublishing: orchConfigRow.trust_content_publishing ?? 0,
          trustExternalActions: orchConfigRow.trust_external_actions ?? 0,
          trustSpending: orchConfigRow.trust_spending ?? 0,
          trustAgentCreation: orchConfigRow.trust_agent_creation ?? 0,
          maxSubtasksPerParent: orchConfigRow.max_subtasks_per_parent ?? 10,
          maxTotalActiveTasks: orchConfigRow.max_total_active_tasks ?? 25,
          maxCostPerTaskCents: orchConfigRow.max_cost_per_task_cents ?? 500,
          maxConcurrentAgents: orchConfigRow.max_concurrent_agents ?? 4,
          maxRetriesPerSubtask: orchConfigRow.max_retries_per_subtask ?? 3,
          monthlySpendBudgetCents: orchConfigRow.monthly_spend_budget_cents ?? 0,
          postMortemEnabled: orchConfigRow.post_mortem_enabled ?? true,
          postMortemParentOnly: orchConfigRow.post_mortem_parent_only ?? true,
          postMortemCostThresholdCents: orchConfigRow.post_mortem_cost_threshold_cents ?? 10,
          dryRunDefault: orchConfigRow.dry_run_default ?? true,
          autoRouteRootTasks: orchConfigRow.auto_route_root_tasks ?? false,
          autoRetryOnFailure: orchConfigRow.auto_retry_on_failure ?? false,
          notifyOnCompletion: orchConfigRow.notify_on_completion ?? true,
          modelTriage: orchConfigRow.model_triage ?? 'haiku',
          modelDecomposition: orchConfigRow.model_decomposition ?? 'sonnet',
          modelReview: orchConfigRow.model_review ?? 'sonnet',
          modelPostMortem: orchConfigRow.model_post_mortem ?? 'opus',
          modelSkillGeneration: orchConfigRow.model_skill_generation ?? 'opus',
          preferences: orchConfigRow.preferences ?? {},
          createdAt: orchConfigRow.created_at,
          updatedAt: orchConfigRow.updated_at,
        } : {
          // Defaults if no config exists
          id: '', accountId, orchestratorAgentId: input.agent.id,
          maxDecompositionDepth: 1, autoDecompose: false,
          trustTaskExecution: 0, trustDecomposition: 0, trustSkillCreation: 0,
          trustToolUsage: 0, trustContentPublishing: 0, trustExternalActions: 0,
          trustSpending: 0, trustAgentCreation: 0,
          maxSubtasksPerParent: 10, maxTotalActiveTasks: 25, maxCostPerTaskCents: 500,
          maxConcurrentAgents: 4, maxRetriesPerSubtask: 3, monthlySpendBudgetCents: 0,
          postMortemEnabled: true, postMortemParentOnly: true, postMortemCostThresholdCents: 10,
          dryRunDefault: true, autoRouteRootTasks: false, autoRetryOnFailure: false,
          notifyOnCompletion: true,
          modelTriage: 'haiku', modelDecomposition: 'sonnet', modelReview: 'sonnet',
          modelPostMortem: 'opus', modelSkillGeneration: 'opus',
          preferences: {}, createdAt: '', updatedAt: '',
        }

        // Fetch active worker agents for the roster
        const { data: workers } = await supabase
          .from('agent_personas')
          .select('id, alias, agent_type, capabilities')
          .eq('account_id', accountId)
          .eq('is_active', true)
          .neq('agent_type', 'orchestrator')
          .is('deleted_at', null)
          .is('paused_at', null)

        const workerAgents = (workers || []).map(w => ({
          id: w.id,
          alias: w.alias || w.agent_type,
          agentType: w.agent_type,
          capabilities: w.capabilities || [],
        }))

        // Check if this is a re-entry with an approved plan
        const taskInput = input.task.input as Record<string, unknown> | undefined
        const taskOutput = input.task.output as Record<string, unknown> | undefined
        const planApproved = taskInput?.plan_approved === true
        const approvedPlan = planApproved && taskOutput?.plan
          ? taskOutput.plan as OrchestratorPlan
          : undefined

        orchestratorCtx = {
          config: orchConfig,
          workerAgents,
          task: input.task,
          planApproved,
          approvedPlan,
        }

        console.log(`[Executor] Orchestrator mode: planApproved=${planApproved}, ${workerAgents.length} worker agents, maxSubtasks=${orchConfig.maxSubtasksPerParent}`)
      } catch (err) {
        console.warn('[Executor] Failed to fetch orchestrator context, using degraded defaults:', err)
        // Build degraded context so Atlas still gets protocol instructions
        const taskInput = input.task.input as Record<string, unknown> | undefined
        const taskOutput = input.task.output as Record<string, unknown> | undefined
        const planApproved = taskInput?.plan_approved === true
        const approvedPlan = planApproved && taskOutput?.plan
          ? taskOutput.plan as OrchestratorPlan
          : undefined
        orchestratorCtx = {
          config: {
            id: '', accountId: accountId || '', orchestratorAgentId: input.agent.id,
            maxDecompositionDepth: 1, autoDecompose: false,
            trustTaskExecution: 0, trustDecomposition: 0, trustSkillCreation: 0,
            trustToolUsage: 0, trustContentPublishing: 0, trustExternalActions: 0,
            trustSpending: 0, trustAgentCreation: 0,
            maxSubtasksPerParent: 10, maxTotalActiveTasks: 25, maxCostPerTaskCents: 500,
            maxConcurrentAgents: 4, maxRetriesPerSubtask: 3, monthlySpendBudgetCents: 0,
            postMortemEnabled: true, postMortemParentOnly: true, postMortemCostThresholdCents: 10,
            dryRunDefault: true, autoRouteRootTasks: false, autoRetryOnFailure: false,
            notifyOnCompletion: true,
            modelTriage: 'haiku', modelDecomposition: 'sonnet', modelReview: 'sonnet',
            modelPostMortem: 'opus', modelSkillGeneration: 'opus',
            preferences: {}, createdAt: '', updatedAt: '',
          },
          workerAgents: [],
          task: input.task,
          planApproved,
          approvedPlan,
        }
      }
    }

    const systemPrompt = buildAgentSystemPrompt(input.agent, input.skill, llmToolDefs, availableSkills, orchestratorCtx)
    const userPrompt = buildTaskPrompt(input.task, input.additionalContext)

    // Track tool usage across iterations
    const toolsUsed: ToolUsage[] = []
    let totalInputTokens = 0
    let totalOutputTokens = 0
    let iterations = 0
    let activeConfig: LLMConfig = config // Track which config actually served

    // ── Auto-materialize subtasks from approved plan ──────────────────
    // When Atlas has an approved plan, create all subtasks programmatically
    // with correct dependency wiring instead of relying on the LLM to do it.
    if (orchestratorCtx?.planApproved && orchestratorCtx?.approvedPlan && accountId) {
      const plan = orchestratorCtx.approvedPlan
      const createdTaskIds: string[] = [] // index → task ID mapping
      const createdSummary: string[] = []

      onStatusChange?.('creating_subtasks', `Creating ${plan.subtasks.length} subtasks from approved plan`)

      for (let i = 0; i < plan.subtasks.length; i++) {
        const step = plan.subtasks[i]
        // Map dependsOnSteps (0-indexed step indices) to actual task IDs
        const depTaskIds = (step.dependsOnSteps || [])
          .filter(idx => idx >= 0 && idx < createdTaskIds.length && createdTaskIds[idx])
          .map(idx => createdTaskIds[idx])

        const result = await createTaskTool({
          title: step.title,
          description: step.description || `Subtask ${i + 1} from orchestrator plan: ${step.title}`,
          priority: step.priority || 'medium',
          assign_to_agent_type: step.assignToAgentType,
          depends_on_task_ids: depTaskIds,
          accountId,
          _contextTaskId: input.task.id,
          _agentId: input.agent.id,
        })

        const resultData = result.data as Record<string, unknown> | undefined
        if (result.success && resultData?.taskId) {
          createdTaskIds.push(resultData.taskId as string)
          const deps = depTaskIds.length > 0 ? ` (depends on: ${depTaskIds.map(id => id.slice(0, 8)).join(', ')})` : ''
          createdSummary.push(`  ${i + 1}. "${step.title}" → ${step.assignToAgentType} (ID: ${resultData.taskId})${deps}`)
        } else {
          createdTaskIds.push('') // placeholder to keep index alignment
          createdSummary.push(`  ${i + 1}. "${step.title}" — FAILED: ${result.error}`)
        }
      }

      // Update root task to in_progress
      if (supabase) {
        await supabase.from('tasks').update({
          status: 'in_progress',
          updated_at: new Date().toISOString(),
        }).eq('id', input.task.id)
      }

      // Return immediately — no need for LLM to create subtasks
      const successCount = createdTaskIds.filter(id => id !== '').length
      return {
        success: true,
        content: `Plan executed: ${successCount}/${plan.subtasks.length} subtasks created.\n\n${createdSummary.join('\n')}`,
        metadata: {
          model: config.model,
          inputTokens: 0,
          outputTokens: 0,
          durationMs: Date.now() - startTime,
          toolsUsed: [{ name: 'create_task', input: { subtaskCount: plan.subtasks.length }, success: true }],
          toolIterations: 0,
        },
      }
    }

    // Build initial messages in universal format
    const messages: LLMMessage[] = [
      { role: 'user', content: userPrompt }
    ]

    // Tool use loop — limit varies by agent type
    const maxIterations = MAX_ITERATIONS_BY_AGENT_TYPE[input.agent.agentType] || DEFAULT_MAX_ITERATIONS
    while (iterations < maxIterations) {
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
        // Inject context fields that tools need but the LLM doesn't provide
        const toolUseRequests: ToolUseRequest[] = toolUseBlocks.map((block: LLMContentBlock) => ({
          type: 'tool_use' as const,
          id: block.toolCallId || `tool_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name: block.toolName || '',
          input: {
            ...(block.toolInput || {}),
            _agentId: input.agent.id,
            _contextTaskId: input.task.id,
          } as Record<string, unknown>,
        }))

        // ── Guardrail check (orchestrator agents only) ──
        let finalToolRequests = toolUseRequests
        let blockedToolResults: ToolResultMessage[] = []
        if (orchestratorCtx && accountId) {
          const guardrailResult = await filterToolRequests(
            toolUseRequests,
            orchestratorCtx.config,
            accountId,
            input.task.id,
            input.agent.id,
          )
          finalToolRequests = guardrailResult.allowed
          // Create error results for blocked tools
          blockedToolResults = guardrailResult.blocked.map(b => ({
            type: 'tool_result' as const,
            tool_use_id: b.request.id,
            content: `GUARDRAIL BLOCKED: ${b.result.rationale}`,
            is_error: true,
          }))
          if (guardrailResult.blocked.length > 0) {
            console.log(`[Guardrails] Blocked ${guardrailResult.blocked.length} tool(s): ${guardrailResult.blocked.map(b => b.request.name).join(', ')}`)
          }
        }

        // Execute the allowed tools
        const toolExecStart = Date.now()
        const allowedResults = finalToolRequests.length > 0
          ? await processToolUses(finalToolRequests, accountId)
          : []
        // Merge allowed results with blocked results in original order
        const toolResults: ToolResultMessage[] = toolUseRequests.map(req => {
          const blocked = blockedToolResults.find(b => b.tool_use_id === req.id)
          if (blocked) return blocked
          const idx = finalToolRequests.indexOf(req)
          return idx >= 0 ? allowedResults[idx] : { type: 'tool_result' as const, tool_use_id: req.id, content: 'Unknown error', is_error: true }
        })
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
      error: `Max tool iterations (${maxIterations}) exceeded`,
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
