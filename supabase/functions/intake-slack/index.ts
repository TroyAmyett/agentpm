// AgentPM Slack Intake — Receives Slack events and slash commands
// Handles:
//   1. Slash command: /agentpm "task description"
//   2. Message forwarding: messages sent to the AgentPM bot
//   3. Slack Events API verification challenge

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// ─── Types ──────────────────────────────────────────────────────────────────

interface SlackSlashCommand {
  token: string
  team_id: string
  team_domain: string
  channel_id: string
  channel_name: string
  user_id: string
  user_name: string
  command: string
  text: string
  response_url: string
  trigger_id: string
}

interface SlackEvent {
  type: string
  challenge?: string
  token?: string
  team_id?: string
  event?: {
    type: string
    user: string
    text: string
    channel: string
    ts: string
    thread_ts?: string
    bot_id?: string
    files?: Array<{
      name: string
      size: number
      mimetype: string
      url_private: string
    }>
  }
}

// ─── Slack Signature Verification ───────────────────────────────────────────

async function verifySlackSignature(
  req: Request,
  body: string,
  signingSecret: string
): Promise<boolean> {
  const timestamp = req.headers.get('x-slack-request-timestamp')
  const signature = req.headers.get('x-slack-signature')

  if (!timestamp || !signature) return false

  // Prevent replay attacks (within 5 minutes)
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - parseInt(timestamp)) > 300) return false

  const sigBasestring = `v0:${timestamp}:${body}`
  const encoder = new TextEncoder()

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(signingSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(sigBasestring))
  const hexSig = 'v0=' + Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  return hexSig === signature
}

// ─── Slack User Info Lookup ─────────────────────────────────────────────────

async function getSlackUserInfo(
  botToken: string,
  userId: string
): Promise<{ name: string; email?: string } | null> {
  try {
    const response = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
      headers: { 'Authorization': `Bearer ${botToken}` },
    })
    const data = await response.json()
    if (data.ok && data.user) {
      return {
        name: data.user.real_name || data.user.name,
        email: data.user.profile?.email,
      }
    }
  } catch { /* ignore */ }
  return null
}

// ─── Slack Response Helpers ─────────────────────────────────────────────────

async function respondToSlack(responseUrl: string, message: string, isEphemeral = true) {
  await fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      response_type: isEphemeral ? 'ephemeral' : 'in_channel',
      text: message,
    }),
  }).catch(err => console.error('Failed to respond to Slack:', err))
}

async function sendSlackMessage(
  botToken: string,
  channelId: string,
  text: string,
  blocks?: unknown[]
) {
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel: channelId,
      text,
      blocks,
    }),
  }).catch(err => console.error('Failed to send Slack message:', err))
}

// ─── Main Handler ───────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Read body as text for signature verification
    const rawBody = await req.text()
    const contentType = req.headers.get('content-type') || ''

    // ── Handle Events API (JSON) ────────────────────────────────────────
    if (contentType.includes('application/json')) {
      const event: SlackEvent = JSON.parse(rawBody)

      // Handle URL verification challenge
      if (event.type === 'url_verification' && event.challenge) {
        return new Response(
          JSON.stringify({ challenge: event.challenge }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      }

      // Handle event callbacks
      if (event.type === 'event_callback' && event.event) {
        const slackEvent = event.event

        // Ignore bot messages to prevent loops
        if (slackEvent.bot_id) {
          return new Response('ok')
        }

        // Only handle direct messages and app mentions
        if (slackEvent.type !== 'message' && slackEvent.type !== 'app_mention') {
          return new Response('ok')
        }

        // Find the intake channel for this team
        const { data: channel } = await supabase
          .from('intake_channels')
          .select('id, account_id, config')
          .eq('channel_type', 'slack')
          .eq('is_active', true)
          .is('deleted_at', null)
          .limit(1)

        // Filter by team_id in config
        const matchingChannel = (channel || []).find(ch => {
          const config = ch.config as Record<string, unknown>
          return config.team_id === event.team_id
        })

        if (!matchingChannel) {
          console.error('No Slack intake channel for team:', event.team_id)
          return new Response('ok')
        }

        const channelConfig = matchingChannel.config as Record<string, unknown>
        const botToken = channelConfig.bot_token_enc as string

        // Verify signature if signing secret is configured
        const signingSecret = channelConfig.signing_secret_enc as string
        if (signingSecret) {
          const isValid = await verifySlackSignature(req, rawBody, signingSecret)
          if (!isValid) {
            return new Response('Invalid signature', { status: 401 })
          }
        }

        // Get user info for sender name
        let senderName = slackEvent.user
        if (botToken) {
          const userInfo = await getSlackUserInfo(botToken, slackEvent.user)
          if (userInfo) senderName = userInfo.name
        }

        // Strip bot mention from text
        let taskText = slackEvent.text || ''
        taskText = taskText.replace(/<@[A-Z0-9]+>/g, '').trim()

        if (!taskText) {
          if (botToken) {
            await sendSlackMessage(
              botToken,
              slackEvent.channel,
              "I need some text to create a task from. Try sending me a message with your task description."
            )
          }
          return new Response('ok')
        }

        // Forward to intake-task
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

        const intakeResponse = await fetch(`${supabaseUrl}/functions/v1/intake-task`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            sourceType: 'slack',
            sourceId: slackEvent.ts,
            senderAddress: slackEvent.user,
            senderName,
            rawContent: taskText,
            channelId: matchingChannel.id,
            attachments: (slackEvent.files || []).map(f => ({
              name: f.name,
              size: f.size,
              contentType: f.mimetype,
            })),
          }),
        })

        const result = await intakeResponse.json()

        // Send confirmation back to Slack
        if (botToken && result.success) {
          const appUrl = Deno.env.get('APP_URL') || 'https://app.funnelists.com'
          await sendSlackMessage(
            botToken,
            slackEvent.channel,
            `Task created: *${result.parsedTitle}*\nPriority: ${result.parsedPriority || 'medium'}\n<${appUrl}/#agentpm/tasks?task=${result.taskId}|View in AgentPM>`
          )
        } else if (botToken && !result.success) {
          await sendSlackMessage(
            botToken,
            slackEvent.channel,
            `Failed to create task: ${result.error}`
          )
        }

        return new Response('ok')
      }

      return new Response('ok')
    }

    // ── Handle Slash Commands (form-encoded) ────────────────────────────
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams(rawBody)
      const command: SlackSlashCommand = {
        token: params.get('token') || '',
        team_id: params.get('team_id') || '',
        team_domain: params.get('team_domain') || '',
        channel_id: params.get('channel_id') || '',
        channel_name: params.get('channel_name') || '',
        user_id: params.get('user_id') || '',
        user_name: params.get('user_name') || '',
        command: params.get('command') || '',
        text: params.get('text') || '',
        response_url: params.get('response_url') || '',
        trigger_id: params.get('trigger_id') || '',
      }

      if (!command.text.trim()) {
        return new Response(
          JSON.stringify({
            response_type: 'ephemeral',
            text: 'Usage: /agentpm <task description>\nExample: /agentpm Research competitor pricing strategies',
          }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      }

      // Find intake channel for this Slack team
      const { data: channels } = await supabase
        .from('intake_channels')
        .select('id, account_id, config')
        .eq('channel_type', 'slack')
        .eq('is_active', true)
        .is('deleted_at', null)

      const matchingChannel = (channels || []).find(ch => {
        const config = ch.config as Record<string, unknown>
        return config.team_id === command.team_id
      })

      if (!matchingChannel) {
        return new Response(
          JSON.stringify({
            response_type: 'ephemeral',
            text: 'AgentPM is not configured for this Slack workspace. Please set up a Slack intake channel in AgentPM settings.',
          }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      }

      // Immediately acknowledge (Slack requires response within 3 seconds)
      // Then process asynchronously via response_url
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

      // Fire and forget — respond via response_url
      (async () => {
        try {
          const intakeResponse = await fetch(`${supabaseUrl}/functions/v1/intake-task`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              sourceType: 'slack',
              sourceId: `slash-${command.trigger_id}`,
              senderAddress: command.user_id,
              senderName: command.user_name,
              rawContent: command.text,
              channelId: matchingChannel.id,
            }),
          })

          const result = await intakeResponse.json()
          const appUrl = Deno.env.get('APP_URL') || 'https://app.funnelists.com'

          if (result.success) {
            await respondToSlack(
              command.response_url,
              `Task created: *${result.parsedTitle}*\nPriority: ${result.parsedPriority || 'medium'}\n<${appUrl}/#agentpm/tasks?task=${result.taskId}|View in AgentPM>`,
              false // visible to everyone in channel
            )
          } else {
            await respondToSlack(
              command.response_url,
              `Failed to create task: ${result.error}`
            )
          }
        } catch (err) {
          console.error('Async slash command processing failed:', err)
          await respondToSlack(
            command.response_url,
            'Something went wrong processing your task. Please try again.'
          )
        }
      })()

      // Immediate acknowledgment
      return new Response(
        JSON.stringify({
          response_type: 'ephemeral',
          text: `Creating task from: "${command.text}"...`,
        }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Unsupported content type' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Slack intake error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
