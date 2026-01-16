// AgentPM Queue API - Supabase Edge Function
// Handles agent task queue operations as defined in PRD Part 2

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// Types
interface QueueRequest {
  action: 'poll' | 'claim' | 'progress' | 'complete' | 'fail'
  taskId?: string
  agentId?: string
  agentType?: string
  accountId?: string
  limit?: number
  progress?: number
  message?: string
  output?: {
    type: string
    url?: string
    content?: string
    metadata?: Record<string, unknown>
  }
  error?: string
  retryable?: boolean
}

interface QueueResponse {
  success: boolean
  task?: unknown
  tasks?: unknown[]
  account?: unknown
  error?: string
}

// Verify API key and extract account context
async function verifyApiKey(
  supabase: ReturnType<typeof createClient>,
  authHeader: string | null
): Promise<{ accountId: string; agentType?: string; agentId?: string } | null> {
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }

  const apiKey = authHeader.replace('Bearer ', '')
  const keyPrefix = apiKey.slice(0, 8)

  const { data, error } = await supabase
    .from('agent_api_keys')
    .select('account_id, agent_type, agent_id, is_active, expires_at')
    .eq('key_prefix', keyPrefix)
    .eq('is_active', true)
    .single()

  if (error || !data) {
    return null
  }

  // Check expiration
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return null
  }

  // Update last_used_at and increment total_requests
  await supabase
    .from('agent_api_keys')
    .update({
      last_used_at: new Date().toISOString(),
      total_requests: supabase.rpc('increment_api_key_requests', { key_prefix: keyPrefix }),
    })
    .eq('key_prefix', keyPrefix)

  return {
    accountId: data.account_id,
    agentType: data.agent_type,
    agentId: data.agent_id,
  }
}

// GET /api/queue - Poll for work
async function handlePoll(
  supabase: ReturnType<typeof createClient>,
  params: { agentType?: string; accountId?: string; limit?: number }
): Promise<QueueResponse> {
  const { agentType, accountId, limit = 1 } = params

  // Build query for queued tasks
  let query = supabase
    .from('tasks')
    .select(`
      *,
      projects (*)
    `)
    .eq('status', 'queued')
    .is('deleted_at', null)
    .order('priority', { ascending: false }) // critical > high > medium > low
    .order('created_at', { ascending: true })
    .limit(limit)

  // Filter by agent type if specified
  if (agentType) {
    query = query.eq('assigned_agent', agentType)
  }

  // Filter by account if specified
  if (accountId) {
    query = query.eq('account_id', accountId)
  }

  const { data: tasks, error: tasksError } = await query

  if (tasksError) {
    return { success: false, error: tasksError.message }
  }

  if (!tasks || tasks.length === 0) {
    return { success: true, tasks: [] }
  }

  // Get account config for context
  const accountIds = [...new Set(tasks.map((t) => t.account_id))]
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name, slug, config')
    .in('id', accountIds)

  const accountsMap = (accounts || []).reduce((map, acc) => {
    map[acc.id] = acc
    return map
  }, {} as Record<string, unknown>)

  // Attach account to each task
  const tasksWithContext = tasks.map((task) => ({
    task,
    account: accountsMap[task.account_id],
  }))

  return {
    success: true,
    tasks: tasksWithContext,
  }
}

// POST /api/queue/:taskId/claim - Claim a task
async function handleClaim(
  supabase: ReturnType<typeof createClient>,
  taskId: string,
  agentId: string
): Promise<QueueResponse> {
  // First check if task is still available
  const { data: task, error: fetchError } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .eq('status', 'queued')
    .single()

  if (fetchError || !task) {
    return {
      success: false,
      error: 'Task not available or already claimed',
    }
  }

  // Claim the task
  const now = new Date().toISOString()
  const { data: updatedTask, error: updateError } = await supabase
    .from('tasks')
    .update({
      status: 'in_progress',
      started_at: now,
      assigned_to: agentId,
      assigned_to_type: 'agent',
      status_history: [
        ...(task.status_history || []),
        {
          status: 'in_progress',
          changedAt: now,
          changedBy: agentId,
          changedByType: 'agent',
          note: 'Claimed by agent',
        },
      ],
      updated_by: agentId,
      updated_by_type: 'agent',
    })
    .eq('id', taskId)
    .eq('status', 'queued') // Double-check still queued (optimistic locking)
    .select()
    .single()

  if (updateError || !updatedTask) {
    return {
      success: false,
      error: 'Failed to claim task - may have been claimed by another agent',
    }
  }

  // Get account for context
  const { data: account } = await supabase
    .from('accounts')
    .select('id, name, slug, config')
    .eq('id', updatedTask.account_id)
    .single()

  return {
    success: true,
    task: updatedTask,
    account,
  }
}

// PATCH /api/queue/:taskId/progress - Update progress
async function handleProgress(
  supabase: ReturnType<typeof createClient>,
  taskId: string,
  agentId: string,
  progress: number,
  message?: string
): Promise<QueueResponse> {
  const { data: task, error } = await supabase
    .from('tasks')
    .update({
      output: {
        progress,
        lastMessage: message,
        lastUpdated: new Date().toISOString(),
      },
      updated_by: agentId,
      updated_by_type: 'agent',
    })
    .eq('id', taskId)
    .eq('status', 'in_progress')
    .select()
    .single()

  if (error || !task) {
    return {
      success: false,
      error: error?.message || 'Task not found or not in progress',
    }
  }

  return { success: true, task }
}

// POST /api/queue/:taskId/complete - Complete a task
async function handleComplete(
  supabase: ReturnType<typeof createClient>,
  taskId: string,
  agentId: string,
  output: QueueRequest['output']
): Promise<QueueResponse> {
  const now = new Date().toISOString()

  // Get current task
  const { data: currentTask, error: fetchError } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single()

  if (fetchError || !currentTask) {
    return { success: false, error: 'Task not found' }
  }

  // Determine next status - goes to 'review' if requires approval
  const nextStatus = 'review' // Default to review for human approval

  const { data: task, error } = await supabase
    .from('tasks')
    .update({
      status: nextStatus,
      completed_at: now,
      output: {
        ...(currentTask.output || {}),
        ...output,
        completedAt: now,
      },
      status_history: [
        ...(currentTask.status_history || []),
        {
          status: nextStatus,
          changedAt: now,
          changedBy: agentId,
          changedByType: 'agent',
          note: 'Task completed by agent',
        },
      ],
      updated_by: agentId,
      updated_by_type: 'agent',
    })
    .eq('id', taskId)
    .select()
    .single()

  if (error || !task) {
    return {
      success: false,
      error: error?.message || 'Failed to complete task',
    }
  }

  // Create review record
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

  // Update agent stats
  await supabase.rpc('update_agent_stats_on_completion', {
    p_agent_id: agentId,
    p_success: true,
  })

  return { success: true, task }
}

// POST /api/queue/:taskId/fail - Fail a task
async function handleFail(
  supabase: ReturnType<typeof createClient>,
  taskId: string,
  agentId: string,
  errorMessage: string,
  retryable: boolean
): Promise<QueueResponse> {
  const now = new Date().toISOString()

  // Get current task
  const { data: currentTask, error: fetchError } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single()

  if (fetchError || !currentTask) {
    return { success: false, error: 'Task not found' }
  }

  const nextStatus = retryable ? 'queued' : 'failed'

  const { data: task, error } = await supabase
    .from('tasks')
    .update({
      status: nextStatus,
      error: {
        message: errorMessage,
        occurredAt: now,
        retryable,
      },
      status_history: [
        ...(currentTask.status_history || []),
        {
          status: nextStatus,
          changedAt: now,
          changedBy: agentId,
          changedByType: 'agent',
          note: `Task failed: ${errorMessage}${retryable ? ' (will retry)' : ''}`,
        },
      ],
      updated_by: agentId,
      updated_by_type: 'agent',
    })
    .eq('id', taskId)
    .select()
    .single()

  if (error || !task) {
    return {
      success: false,
      error: error?.message || 'Failed to update task',
    }
  }

  // Update agent stats
  await supabase.rpc('update_agent_stats_on_completion', {
    p_agent_id: agentId,
    p_success: false,
  })

  // Update agent consecutive failures
  await supabase.rpc('increment_agent_failures', { p_agent_id: agentId })

  return { success: true, task }
}

// Main handler
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client with service role for queue operations
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Verify API key
    const authHeader = req.headers.get('Authorization')
    const apiKeyContext = await verifyApiKey(supabase, authHeader)

    if (!apiKeyContext) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid or expired API key' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Parse request
    const url = new URL(req.url)
    const pathParts = url.pathname.split('/').filter(Boolean)
    const body: QueueRequest = req.method !== 'GET' ? await req.json() : {}

    let response: QueueResponse

    // Route to appropriate handler
    if (req.method === 'GET' || body.action === 'poll') {
      // GET /api/queue?agent=xxx&accountId=xxx&limit=1
      response = await handlePoll(supabase, {
        agentType: body.agentType || url.searchParams.get('agent') || apiKeyContext.agentType,
        accountId: body.accountId || url.searchParams.get('accountId') || apiKeyContext.accountId,
        limit: body.limit || parseInt(url.searchParams.get('limit') || '1'),
      })
    } else if (body.action === 'claim' && body.taskId) {
      response = await handleClaim(
        supabase,
        body.taskId,
        body.agentId || apiKeyContext.agentId || 'unknown-agent'
      )
    } else if (body.action === 'progress' && body.taskId) {
      response = await handleProgress(
        supabase,
        body.taskId,
        body.agentId || apiKeyContext.agentId || 'unknown-agent',
        body.progress || 0,
        body.message
      )
    } else if (body.action === 'complete' && body.taskId) {
      response = await handleComplete(
        supabase,
        body.taskId,
        body.agentId || apiKeyContext.agentId || 'unknown-agent',
        body.output
      )
    } else if (body.action === 'fail' && body.taskId) {
      response = await handleFail(
        supabase,
        body.taskId,
        body.agentId || apiKeyContext.agentId || 'unknown-agent',
        body.error || 'Unknown error',
        body.retryable ?? false
      )
    } else {
      response = {
        success: false,
        error: 'Invalid action or missing taskId',
      }
    }

    return new Response(JSON.stringify(response), {
      status: response.success ? 200 : 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Queue API error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
