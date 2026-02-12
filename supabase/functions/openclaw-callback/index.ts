// AgentPM OpenClaw Callback — Receives results from OpenClaw agent runtime
// Handles:
//   1. Task completion reports (with correlationId → updates existing task)
//   2. Proactive task creation (no correlationId → creates new task via intake-task)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// ─── Types ──────────────────────────────────────────────────────────────────

interface OpenClawCallbackPayload {
  // Correlation — if present, update existing AgentPM task
  correlationId?: string       // AgentPM task ID
  agentpmTaskId?: string       // Alias for correlationId

  // Source identification
  agentName?: string           // Which OpenClaw agent sent this
  sessionId?: string           // OpenClaw session ID

  // Result
  status: 'completed' | 'failed' | 'in_progress' | 'info'
  result: string               // Text result or summary
  metadata?: Record<string, unknown>

  // For proactive task creation (no correlation)
  title?: string
  description?: string
  priority?: 'critical' | 'high' | 'medium' | 'low'
  tags?: string[]
}

// ─── Main Handler ───────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // ── Authenticate via channel ──────────────────────────────────────
    const url = new URL(req.url)
    const channelId = url.searchParams.get('channel')
    const authToken = req.headers.get('x-agentpm-token')

    if (!channelId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing channel parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Look up the channel and verify the callback secret
    const { data: channel, error: channelError } = await supabase
      .from('intake_channels')
      .select('id, account_id, config, is_active')
      .eq('id', channelId)
      .eq('channel_type', 'openclaw')
      .is('deleted_at', null)
      .single()

    if (channelError || !channel) {
      return new Response(
        JSON.stringify({ success: false, error: 'OpenClaw channel not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!channel.is_active) {
      return new Response(
        JSON.stringify({ success: false, error: 'Channel is inactive' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const config = channel.config as Record<string, unknown>
    const expectedSecret = config.callback_secret as string

    if (expectedSecret && authToken !== expectedSecret) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid callback token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const accountId = channel.account_id
    const body: OpenClawCallbackPayload = await req.json()
    const taskId = body.correlationId || body.agentpmTaskId

    // ── Case 1: Update existing task ──────────────────────────────────
    if (taskId) {
      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      }

      // Append the result to the task description
      if (body.result) {
        const { data: existingTask } = await supabase
          .from('tasks')
          .select('description')
          .eq('id', taskId)
          .eq('account_id', accountId)
          .single()

        const separator = '\n\n---\n\n'
        const resultBlock = [
          `**OpenClaw Result** (${body.agentName || 'agent'}, ${new Date().toISOString()})`,
          '',
          body.result,
        ].join('\n')

        updates.description = existingTask?.description
          ? `${existingTask.description}${separator}${resultBlock}`
          : resultBlock
      }

      // Map OpenClaw status to AgentPM task status
      if (body.status === 'completed') {
        updates.status = 'review'
      } else if (body.status === 'failed') {
        updates.status = 'failed'
      }

      if (body.metadata) {
        updates.metadata = body.metadata
      }

      const { error: updateError } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', taskId)
        .eq('account_id', accountId)

      if (updateError) {
        console.error('Failed to update task:', updateError)
        return new Response(
          JSON.stringify({ success: false, error: `Failed to update task: ${updateError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Log to intake_log for audit trail
      await supabase.from('intake_log').insert({
        account_id: accountId,
        channel_id: channelId,
        source_type: 'openclaw',
        source_id: body.sessionId,
        sender_name: body.agentName || 'OpenClaw',
        raw_subject: `Callback: ${body.status}`,
        raw_content: body.result?.slice(0, 1000),
        status: 'task_created',
        task_id: taskId,
        parsed_title: `Updated task ${taskId}`,
      })

      return new Response(
        JSON.stringify({ success: true, action: 'task_updated', taskId }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Case 2: Create new task (proactive) ───────────────────────────
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    const intakeResponse = await fetch(`${supabaseUrl}/functions/v1/intake-task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        sourceType: 'openclaw',
        sourceId: body.sessionId,
        senderName: body.agentName || 'OpenClaw',
        title: body.title,
        description: body.description || body.result,
        rawContent: body.result,
        priority: body.priority,
        tags: body.tags,
        channelId,
      }),
    })

    const result = await intakeResponse.json()

    return new Response(
      JSON.stringify({
        success: result.success,
        action: 'task_created',
        taskId: result.taskId,
        error: result.error,
      }),
      {
        status: intakeResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('OpenClaw callback error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
