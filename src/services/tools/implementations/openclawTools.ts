// OpenClaw Tool Implementations — Execute tasks on external OpenClaw runtime

import { createClient } from '@supabase/supabase-js'
import { createClientFromConfig } from '@/services/openclaw/client'
import type { ToolResult } from '../types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

/**
 * Execute a task on the OpenClaw runtime
 * Finds the OpenClaw channel config, builds a client, and sends the task
 */
export async function executeOpenClawTool(params: {
  agent_name?: string
  task: string
  context?: Record<string, unknown>
  callback_task_id?: string
  accountId: string
}): Promise<ToolResult> {
  const { agent_name, task, context, callback_task_id, accountId } = params

  // Find the OpenClaw intake channel for this account
  const supabase = createClient(supabaseUrl, supabaseKey)

  const { data: channels, error: fetchError } = await supabase
    .from('intake_channels')
    .select('id, config')
    .eq('account_id', accountId)
    .eq('channel_type', 'openclaw')
    .eq('is_active', true)
    .is('deleted_at', null)
    .limit(1)

  if (fetchError || !channels || channels.length === 0) {
    return {
      success: false,
      error: 'No active OpenClaw channel configured. Go to Settings > Channels to add one.',
    }
  }

  const channel = channels[0]
  const config = channel.config as Record<string, unknown>
  const client = createClientFromConfig(config)

  if (!client) {
    return {
      success: false,
      error: 'OpenClaw channel is missing runtime_url or auth_token. Update the channel config in Settings.',
    }
  }

  // Build context with callback info so OpenClaw can report back
  const enrichedContext: Record<string, unknown> = {
    ...(context || {}),
    agentpm_channel_id: channel.id,
    ...(callback_task_id ? { agentpm_task_id: callback_task_id } : {}),
  }

  // Determine agent name — use provided, or fall back to channel default
  const targetAgent = agent_name || (config.default_agent as string) || 'main'

  // Send the task
  const result = await client.sendTask(targetAgent, task, enrichedContext)

  if (!result.success) {
    return {
      success: false,
      error: result.error || 'OpenClaw execution failed',
    }
  }

  return {
    success: true,
    data: {
      formatted: [
        `Task sent to OpenClaw agent "${targetAgent}".`,
        result.sessionId ? `Session: ${result.sessionId}` : '',
        result.response ? `Response: ${result.response}` : '',
        callback_task_id ? `Will update task ${callback_task_id} on completion.` : '',
      ].filter(Boolean).join('\n'),
      sessionId: result.sessionId,
      agentName: targetAgent,
      response: result.response,
    },
    metadata: {
      executionTimeMs: 0,
      source: 'openclaw',
    },
  }
}
