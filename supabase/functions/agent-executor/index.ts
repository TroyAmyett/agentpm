// Agent Executor Edge Function
// Executes tasks assigned to AI agents

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.32'

// Initialize clients
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')!

const supabase = createClient(supabaseUrl, supabaseServiceKey)
const anthropic = new Anthropic({ apiKey: anthropicApiKey })

interface ExecuteTaskRequest {
  taskId: string
  agentId: string
}

interface AgentPersona {
  id: string
  account_id: string
  agent_type: string
  alias: string
  tagline?: string
  capabilities: string[]
  restrictions: string[]
  autonomy_level: string
  requires_approval: string[]
  is_active: boolean
  paused_at?: string
  consecutive_failures: number
  max_consecutive_failures: number
  health_status: string
  max_actions_per_hour?: number
  max_cost_per_action?: number
}

interface Task {
  id: string
  account_id: string
  title: string
  description?: string
  status: string
  input?: Record<string, unknown>
  assigned_to?: string
  assigned_to_type?: string
}

serve(async (req) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers })
  }

  try {
    const { taskId, agentId }: ExecuteTaskRequest = await req.json()

    if (!taskId || !agentId) {
      return new Response(
        JSON.stringify({ error: 'taskId and agentId are required' }),
        { status: 400, headers }
      )
    }

    // Fetch task and agent
    const [taskResult, agentResult] = await Promise.all([
      supabase.from('tasks').select('*').eq('id', taskId).single(),
      supabase.from('agent_personas').select('*').eq('id', agentId).single(),
    ])

    if (taskResult.error) {
      return new Response(
        JSON.stringify({ error: `Task not found: ${taskResult.error.message}` }),
        { status: 404, headers }
      )
    }

    if (agentResult.error) {
      return new Response(
        JSON.stringify({ error: `Agent not found: ${agentResult.error.message}` }),
        { status: 404, headers }
      )
    }

    const task = taskResult.data as Task
    const agent = agentResult.data as AgentPersona

    // Validate agent can execute
    if (!agent.is_active) {
      return new Response(
        JSON.stringify({ error: `Agent ${agent.alias} is not active` }),
        { status: 400, headers }
      )
    }

    if (agent.paused_at) {
      return new Response(
        JSON.stringify({ error: `Agent ${agent.alias} is paused` }),
        { status: 400, headers }
      )
    }

    if (agent.consecutive_failures >= agent.max_consecutive_failures) {
      return new Response(
        JSON.stringify({ error: `Agent ${agent.alias} is circuit-broken due to failures` }),
        { status: 400, headers }
      )
    }

    // Update task status to in_progress
    const startTime = Date.now()
    await supabase
      .from('tasks')
      .update({
        status: 'in_progress',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: agentId,
        updated_by_type: 'agent',
      })
      .eq('id', taskId)

    let result: Record<string, unknown> | null = null
    let reasoning = ''
    let tokensUsed = 0
    let executionError: string | null = null

    try {
      // Build system prompt based on agent type
      const systemPrompt = buildSystemPrompt(agent)
      const userPrompt = buildTaskPrompt(task)

      // Execute via Claude
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      })

      const content = response.content[0]
      const outputText = content.type === 'text' ? content.text : ''
      tokensUsed = response.usage.input_tokens + response.usage.output_tokens

      result = {
        content: outputText,
        model: response.model,
        stopReason: response.stop_reason,
      }

      reasoning = `Generated response for task "${task.title}" using ${agent.alias} (${agent.agent_type}). Used ${tokensUsed} tokens.`

      // Determine final status based on agent autonomy
      const needsApproval = agent.requires_approval.length > 0
      const finalStatus = needsApproval ? 'review' : 'completed'

      // Update task with success
      await supabase
        .from('tasks')
        .update({
          status: finalStatus,
          output: result,
          completed_at: finalStatus === 'completed' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
          updated_by: agentId,
          updated_by_type: 'agent',
        })
        .eq('id', taskId)

      // Create review if needed
      if (needsApproval) {
        await supabase.from('reviews').insert({
          account_id: task.account_id,
          task_id: taskId,
          agent_id: agentId,
          status: 'pending',
          created_by: agentId,
          created_by_type: 'agent',
          updated_by: agentId,
          updated_by_type: 'agent',
        })
      }

      // Reset failure count on success
      await supabase
        .from('agent_personas')
        .update({
          consecutive_failures: 0,
          health_status: 'healthy',
          last_health_check: new Date().toISOString(),
        })
        .eq('id', agentId)

    } catch (err) {
      executionError = err instanceof Error ? err.message : 'Unknown execution error'
      reasoning = `Failed to execute task: ${executionError}`

      // Update task with failure
      await supabase
        .from('tasks')
        .update({
          status: 'failed',
          error: { message: executionError },
          updated_at: new Date().toISOString(),
          updated_by: agentId,
          updated_by_type: 'agent',
        })
        .eq('id', taskId)

      // Increment failure count
      const newFailures = agent.consecutive_failures + 1
      const newHealthStatus = newFailures >= agent.max_consecutive_failures ? 'failing' : 'degraded'

      await supabase
        .from('agent_personas')
        .update({
          consecutive_failures: newFailures,
          health_status: newHealthStatus,
          last_health_check: new Date().toISOString(),
        })
        .eq('id', agentId)
    }

    // Log the action
    const executionTimeMs = Date.now() - startTime
    const costCents = Math.ceil(tokensUsed * 0.001) // Rough estimate: $0.001 per token

    await supabase.from('agent_actions').insert({
      account_id: task.account_id,
      agent_id: agentId,
      task_id: taskId,
      action: `Executed task: ${task.title}`,
      action_type: 'task-execution',
      status: executionError ? 'failed' : 'success',
      result: result,
      error: executionError,
      reasoning: reasoning,
      confidence: executionError ? 0.0 : 0.85,
      execution_time_ms: executionTimeMs,
      tokens_used: tokensUsed,
      cost: costCents,
      created_by: agentId,
      created_by_type: 'agent',
      updated_by: agentId,
      updated_by_type: 'agent',
    })

    return new Response(
      JSON.stringify({
        success: !executionError,
        taskId,
        agentId,
        result,
        error: executionError,
        executionTimeMs,
        tokensUsed,
      }),
      { headers }
    )

  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error'
    console.error('Agent executor error:', error)

    return new Response(
      JSON.stringify({ error }),
      { status: 500, headers }
    )
  }
})

// Build system prompt based on agent persona
function buildSystemPrompt(agent: AgentPersona): string {
  return `You are ${agent.alias}, a ${agent.agent_type.replace('-', ' ')} AI agent.
${agent.tagline ? agent.tagline : ''}

## Your Capabilities
${agent.capabilities.map((c) => `- ${c}`).join('\n')}

## Restrictions
${agent.restrictions.length > 0 ? agent.restrictions.map((r) => `- You must NOT ${r}`).join('\n') : 'None'}

## Guidelines
- Be thorough and accurate in your work
- Explain your reasoning when helpful
- If you're unsure about something, say so
- Focus on completing the task as requested
- Be concise but complete

## Response Format
Provide your response in a clear, structured format appropriate for the task type.
`
}

// Build task prompt from task data
function buildTaskPrompt(task: Task): string {
  let prompt = `# Task: ${task.title}\n\n`

  if (task.description) {
    prompt += `## Description\n${task.description}\n\n`
  }

  if (task.input && Object.keys(task.input).length > 0) {
    prompt += `## Input Data\n\`\`\`json\n${JSON.stringify(task.input, null, 2)}\n\`\`\`\n\n`
  }

  prompt += `Please complete this task and provide your output.`

  return prompt
}
