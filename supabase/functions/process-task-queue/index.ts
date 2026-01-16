// Process Task Queue Edge Function
// Triggered by pg_cron to process queued tasks

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

interface Task {
  id: string
  account_id: string
  title: string
  assigned_to: string
  assigned_to_type: string
  priority: string
}

interface ProcessResult {
  taskId: string
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

    // Check agent availability before processing
    const agentIds = [...new Set(tasks.map((t) => t.assigned_to))]
    const { data: agents, error: agentsError } = await supabase
      .from('agent_personas')
      .select('id, is_active, paused_at, consecutive_failures, max_consecutive_failures, health_status')
      .in('id', agentIds)

    if (agentsError) {
      console.error('Error fetching agents:', agentsError)
      return new Response(
        JSON.stringify({ error: agentsError.message, processed: 0 }),
        { status: 500, headers }
      )
    }

    // Create a map of available agents
    const availableAgents = new Set(
      (agents || [])
        .filter(
          (a) =>
            a.is_active &&
            !a.paused_at &&
            a.consecutive_failures < a.max_consecutive_failures &&
            a.health_status !== 'failing'
        )
        .map((a) => a.id)
    )

    // Process tasks with available agents
    const results: ProcessResult[] = []

    for (const task of tasks) {
      if (!availableAgents.has(task.assigned_to)) {
        console.log(`Skipping task ${task.id}: Agent ${task.assigned_to} not available`)
        results.push({
          taskId: task.id,
          success: false,
          error: 'Agent not available',
        })
        continue
      }

      try {
        // Call the agent-executor function
        const response = await fetch(`${supabaseUrl}/functions/v1/agent-executor`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            taskId: task.id,
            agentId: task.assigned_to,
          }),
        })

        const result = await response.json()

        if (response.ok && result.success) {
          console.log(`Task ${task.id} completed successfully`)
          results.push({ taskId: task.id, success: true })
        } else {
          console.error(`Task ${task.id} failed:`, result.error)
          results.push({
            taskId: task.id,
            success: false,
            error: result.error || 'Unknown error',
          })
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown error'
        console.error(`Task ${task.id} execution error:`, error)
        results.push({ taskId: task.id, success: false, error })
      }

      // Small delay between tasks to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    const successCount = results.filter((r) => r.success).length
    const failCount = results.filter((r) => !r.success).length

    return new Response(
      JSON.stringify({
        processed: results.length,
        success: successCount,
        failed: failCount,
        results,
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
