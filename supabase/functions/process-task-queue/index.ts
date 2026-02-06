// Process Task Queue Edge Function
// Triggered by pg_cron to process queued tasks
// Per-agent queue isolation: groups by agent, respects concurrency limits

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

const DEFAULT_MAX_CONCURRENT = 2

interface Task {
  id: string
  account_id: string
  title: string
  assigned_to: string
  assigned_to_type: string
  priority: string
}

interface Agent {
  id: string
  is_active: boolean
  paused_at: string | null
  consecutive_failures: number
  max_consecutive_failures: number
  health_status: string
  max_concurrent_tasks: number | null
}

interface ProcessResult {
  taskId: string
  agentId: string
  success: boolean
  error?: string
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
    // Get optional limit from request body
    let limit = 10
    try {
      const body = await req.json()
      if (body.limit && typeof body.limit === 'number') {
        limit = Math.min(body.limit, 50) // Max 50 per run
      }
    } catch {
      // No body or invalid JSON, use default limit
    }

    // Fetch queued tasks assigned to agents
    // Order by priority (critical first) then by creation time
    const { data: tasks, error: fetchError } = await supabase
      .from('tasks')
      .select('id, account_id, title, assigned_to, assigned_to_type, priority')
      .eq('status', 'queued')
      .eq('assigned_to_type', 'agent')
      .not('assigned_to', 'is', null)
      .is('deleted_at', null)
      .order('priority', { ascending: true }) // critical < high < medium < low alphabetically
      .order('created_at', { ascending: true })
      .limit(limit)

    if (fetchError) {
      console.error('Error fetching tasks:', fetchError)
      return new Response(
        JSON.stringify({ error: fetchError.message, processed: 0 }),
        { status: 500, headers }
      )
    }

    if (!tasks || tasks.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No queued tasks', processed: 0 }),
        { headers }
      )
    }

    console.log(`Processing ${tasks.length} queued tasks`)

    // Check agent availability and concurrency limits
    const agentIds = [...new Set(tasks.map((t) => t.assigned_to))]
    const { data: agents, error: agentsError } = await supabase
      .from('agent_personas')
      .select('id, is_active, paused_at, consecutive_failures, max_consecutive_failures, health_status, max_concurrent_tasks')
      .in('id', agentIds)

    if (agentsError) {
      console.error('Error fetching agents:', agentsError)
      return new Response(
        JSON.stringify({ error: agentsError.message, processed: 0 }),
        { status: 500, headers }
      )
    }

    // Build agent availability + concurrency map
    const agentMap = new Map<string, Agent>()
    for (const a of (agents || []) as Agent[]) {
      if (
        a.is_active &&
        !a.paused_at &&
        a.consecutive_failures < a.max_consecutive_failures &&
        a.health_status !== 'failing'
      ) {
        agentMap.set(a.id, a)
      }
    }

    // Count currently in_progress tasks per agent (to respect concurrency)
    const { data: runningTasks } = await supabase
      .from('tasks')
      .select('assigned_to')
      .eq('status', 'in_progress')
      .eq('assigned_to_type', 'agent')
      .in('assigned_to', [...agentMap.keys()])

    const runningPerAgent = new Map<string, number>()
    for (const t of runningTasks || []) {
      const count = runningPerAgent.get(t.assigned_to) || 0
      runningPerAgent.set(t.assigned_to, count + 1)
    }

    // Group queued tasks by agent
    const tasksByAgent = new Map<string, Task[]>()
    for (const task of tasks) {
      if (!agentMap.has(task.assigned_to)) continue
      const list = tasksByAgent.get(task.assigned_to) || []
      list.push(task)
      tasksByAgent.set(task.assigned_to, list)
    }

    // Process each agent's queue with concurrency isolation
    const allResults: ProcessResult[] = []

    // Process agents in parallel (each agent processes its own tasks)
    const agentPromises = [...tasksByAgent.entries()].map(
      async ([agentId, agentTasks]) => {
        const agent = agentMap.get(agentId)!
        const maxConcurrent = agent.max_concurrent_tasks ?? DEFAULT_MAX_CONCURRENT
        const currentRunning = runningPerAgent.get(agentId) || 0
        const slotsAvailable = Math.max(0, maxConcurrent - currentRunning)

        if (slotsAvailable === 0) {
          console.log(
            `Agent ${agentId}: at capacity (${currentRunning}/${maxConcurrent}), skipping ${agentTasks.length} tasks`
          )
          for (const task of agentTasks) {
            allResults.push({
              taskId: task.id,
              agentId,
              success: false,
              error: `Agent at capacity (${currentRunning}/${maxConcurrent} concurrent)`,
            })
          }
          return
        }

        // Only dispatch up to available slots
        const toDispatch = agentTasks.slice(0, slotsAvailable)
        console.log(
          `Agent ${agentId}: dispatching ${toDispatch.length}/${agentTasks.length} tasks (${slotsAvailable} slots)`
        )

        // Dispatch tasks for this agent concurrently
        const taskPromises = toDispatch.map(async (task) => {
          try {
            const response = await fetch(
              `${supabaseUrl}/functions/v1/agent-executor`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                  taskId: task.id,
                  agentId: task.assigned_to,
                }),
              }
            )

            const result = await response.json()

            if (response.ok && result.success) {
              console.log(`Task ${task.id} completed successfully`)
              allResults.push({ taskId: task.id, agentId, success: true })
            } else {
              console.error(`Task ${task.id} failed:`, result.error)
              allResults.push({
                taskId: task.id,
                agentId,
                success: false,
                error: result.error || 'Unknown error',
              })
            }
          } catch (err) {
            const error =
              err instanceof Error ? err.message : 'Unknown error'
            console.error(`Task ${task.id} execution error:`, error)
            allResults.push({ taskId: task.id, agentId, success: false, error })
          }
        })

        await Promise.all(taskPromises)
      }
    )

    // Also record skipped tasks (agent not available)
    for (const task of tasks) {
      if (!agentMap.has(task.assigned_to)) {
        console.log(`Skipping task ${task.id}: Agent ${task.assigned_to} not available`)
        allResults.push({
          taskId: task.id,
          agentId: task.assigned_to,
          success: false,
          error: 'Agent not available',
        })
      }
    }

    await Promise.all(agentPromises)

    const successCount = allResults.filter((r) => r.success).length
    const failCount = allResults.filter((r) => !r.success).length

    return new Response(
      JSON.stringify({
        processed: allResults.length,
        success: successCount,
        failed: failCount,
        agentsProcessed: tasksByAgent.size,
        results: allResults,
      }),
      { headers }
    )
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error'
    console.error('Process queue error:', error)

    return new Response(
      JSON.stringify({ error, processed: 0 }),
      { status: 500, headers }
    )
  }
})
