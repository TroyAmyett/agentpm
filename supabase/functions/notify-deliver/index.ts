// AgentPM Notification Delivery — Processes pending notifications
// Called by pg_cron (every minute) or directly to deliver notifications
// via email (Resend), Slack, Telegram, or webhook

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// ─── Types ──────────────────────────────────────────────────────────────────

interface NotificationRecord {
  id: string
  account_id: string
  channel_id: string
  task_id: string | null
  workflow_run_id: string | null
  event_type: string
  previous_status: string | null
  new_status: string | null
  subject: string | null
  body: string | null
  attempts: number
  max_attempts: number
}

interface ChannelRecord {
  id: string
  channel_type: string
  config: Record<string, unknown>
  intake_channel_id: string | null
}

interface TaskRecord {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  assigned_to: string | null
  project_id: string | null
  intake_sender: string | null
}

interface DeliveryResult {
  success: boolean
  externalId?: string
  error?: string
}

// ─── Notification Content Builder ───────────────────────────────────────────

function buildNotificationContent(
  task: TaskRecord | null,
  eventType: string,
  previousStatus: string | null,
  newStatus: string | null
): { subject: string; body: string; htmlBody: string } {
  const taskTitle = task?.title || 'Unknown Task'
  const appUrl = Deno.env.get('APP_URL') || 'https://app.funnelists.com'
  const taskUrl = task ? `${appUrl}/#agentpm/tasks?task=${task.id}` : appUrl

  let emoji = '📋'
  let statusLabel = newStatus || 'updated'

  switch (newStatus) {
    case 'queued': emoji = '📥'; statusLabel = 'Queued'; break
    case 'in_progress': emoji = '⚙️'; statusLabel = 'In Progress'; break
    case 'review': emoji = '👀'; statusLabel = 'Ready for Review'; break
    case 'completed': emoji = '✅'; statusLabel = 'Completed'; break
    case 'failed': emoji = '❌'; statusLabel = 'Failed'; break
    case 'cancelled': emoji = '🚫'; statusLabel = 'Cancelled'; break
  }

  const subject = `${emoji} ${statusLabel}: ${taskTitle}`

  const body = [
    `Task "${taskTitle}" changed from ${previousStatus || 'unknown'} to ${statusLabel}.`,
    '',
    task?.description ? `Description: ${task.description.slice(0, 200)}` : '',
    task?.priority ? `Priority: ${task.priority}` : '',
    '',
    `View task: ${taskUrl}`,
  ].filter(Boolean).join('\n')

  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #1a1a2e; border-radius: 12px; padding: 24px; color: #e0e0e0;">
        <h2 style="margin: 0 0 8px; color: #fff;">${emoji} ${statusLabel}</h2>
        <p style="margin: 0 0 16px; font-size: 18px; color: #a0a0c0;">${taskTitle}</p>

        ${task?.description ? `<p style="margin: 0 0 16px; color: #c0c0d0; font-size: 14px;">${task.description.slice(0, 300)}</p>` : ''}

        <div style="background: #252540; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="color: #808090; padding: 4px 0; font-size: 13px;">Status</td>
              <td style="color: #e0e0e0; padding: 4px 0; font-size: 13px; text-align: right;">${previousStatus || '—'} → <strong>${statusLabel}</strong></td>
            </tr>
            ${task?.priority ? `<tr>
              <td style="color: #808090; padding: 4px 0; font-size: 13px;">Priority</td>
              <td style="color: #e0e0e0; padding: 4px 0; font-size: 13px; text-align: right;">${task.priority}</td>
            </tr>` : ''}
          </table>
        </div>

        <a href="${taskUrl}" style="display: inline-block; background: #6366f1; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 14px;">
          View Task
        </a>
      </div>

      <p style="text-align: center; color: #606060; font-size: 12px; margin-top: 16px;">
        Sent by AgentPM — <a href="${appUrl}/#settings/notifications" style="color: #6366f1;">Manage notifications</a>
      </p>
    </div>
  `.trim()

  return { subject, body, htmlBody }
}

// ─── Delivery Adapters ──────────────────────────────────────────────────────

async function deliverViaEmail(
  config: Record<string, unknown>,
  subject: string,
  body: string,
  htmlBody: string,
  task: TaskRecord | null
): Promise<DeliveryResult> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  if (!resendApiKey) {
    return { success: false, error: 'RESEND_API_KEY not configured' }
  }

  const toAddress = (config.to_address as string) ||
    (task?.intake_sender as string)

  if (!toAddress) {
    return { success: false, error: 'No recipient email address' }
  }

  const fromName = (config.from_name as string) || 'AgentPM'
  const fromAddress = (config.from_address as string) || 'notifications@agentpm.app'
  const replyTo = (config.reply_to as string) || undefined

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${fromName} <${fromAddress}>`,
        to: [toAddress],
        subject,
        html: htmlBody,
        text: body,
        reply_to: replyTo,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return {
        success: false,
        error: `Resend API error ${response.status}: ${JSON.stringify(errorData)}`,
      }
    }

    const data = await response.json()
    return { success: true, externalId: data.id }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Email delivery failed',
    }
  }
}

async function deliverViaSlack(
  config: Record<string, unknown>,
  subject: string,
  body: string,
  task: TaskRecord | null
): Promise<DeliveryResult> {
  const webhookUrl = config.webhook_url as string
  const botToken = config.bot_token_enc as string
  const channelId = config.channel_id as string

  const appUrl = Deno.env.get('APP_URL') || 'https://app.funnelists.com'
  const taskUrl = task ? `${appUrl}/#agentpm/tasks?task=${task.id}` : appUrl

  // Build Slack Block Kit message
  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: subject, emoji: true },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: body },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View Task' },
          url: taskUrl,
          style: 'primary',
        },
      ],
    },
  ]

  try {
    let response: Response

    if (webhookUrl) {
      // Send via incoming webhook
      response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks, text: subject }),
      })
    } else if (botToken && channelId) {
      // Send via Bot API
      response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: channelId,
          blocks,
          text: subject,
        }),
      })
    } else {
      return { success: false, error: 'No Slack webhook URL or bot token configured' }
    }

    if (!response.ok) {
      return { success: false, error: `Slack API error: ${response.status}` }
    }

    const data = await response.json()
    if (data.ok === false) {
      return { success: false, error: `Slack error: ${data.error}` }
    }

    return { success: true, externalId: data.ts || data.message?.ts }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Slack delivery failed',
    }
  }
}

async function deliverViaTelegram(
  config: Record<string, unknown>,
  subject: string,
  body: string,
  task: TaskRecord | null
): Promise<DeliveryResult> {
  const botToken = config.bot_token_enc as string
  const chatId = config.chat_id as string

  if (!botToken || !chatId) {
    return { success: false, error: 'Telegram bot token or chat ID not configured' }
  }

  const appUrl = Deno.env.get('APP_URL') || 'https://app.funnelists.com'
  const taskUrl = task ? `${appUrl}/#agentpm/tasks?task=${task.id}` : appUrl

  // Telegram markdown message
  const message = [
    `*${subject}*`,
    '',
    body,
    '',
    `[View Task](${taskUrl})`,
  ].join('\n')

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        }),
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return {
        success: false,
        error: `Telegram API error ${response.status}: ${JSON.stringify(errorData)}`,
      }
    }

    const data = await response.json()
    return {
      success: true,
      externalId: data.result?.message_id?.toString(),
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Telegram delivery failed',
    }
  }
}

async function deliverViaWebhook(
  config: Record<string, unknown>,
  subject: string,
  body: string,
  notification: NotificationRecord,
  task: TaskRecord | null
): Promise<DeliveryResult> {
  const url = config.url as string
  const method = (config.method as string) || 'POST'
  const headers = (config.headers as Record<string, string>) || {}
  const secret = config.secret as string

  if (!url) {
    return { success: false, error: 'No webhook URL configured' }
  }

  const payload = {
    event: notification.event_type,
    task: task ? {
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      previousStatus: notification.previous_status,
      newStatus: notification.new_status,
    } : null,
    subject,
    body,
    timestamp: new Date().toISOString(),
  }

  const payloadStr = JSON.stringify(payload)

  // Add HMAC signature if secret is configured
  if (secret) {
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(payloadStr)
    )
    const hexSignature = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    headers['x-webhook-signature'] = `sha256=${hexSignature}`
  }

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: payloadStr,
    })

    if (!response.ok) {
      return {
        success: false,
        error: `Webhook returned ${response.status}`,
      }
    }

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Webhook delivery failed',
    }
  }
}

// ─── Main Handler ───────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Fetch pending notifications (up to 50)
    const { data: notifications, error: fetchError } = await supabase
      .from('notification_log')
      .select('*')
      .in('status', ['pending', 'sending'])
      .lt('attempts', 3) // Don't retry more than max_attempts
      .order('created_at', { ascending: true })
      .limit(50)

    if (fetchError) {
      throw new Error(`Failed to fetch notifications: ${fetchError.message}`)
    }

    if (!notifications || notifications.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: 'No pending notifications' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let delivered = 0
    let failed = 0

    for (const notif of notifications as NotificationRecord[]) {
      // Mark as sending
      await supabase
        .from('notification_log')
        .update({ status: 'sending', attempts: notif.attempts + 1 })
        .eq('id', notif.id)

      // Get channel config
      const { data: channel } = await supabase
        .from('notification_channels')
        .select('id, channel_type, config, intake_channel_id')
        .eq('id', notif.channel_id)
        .single()

      if (!channel) {
        await supabase
          .from('notification_log')
          .update({ status: 'failed', error: 'Channel not found' })
          .eq('id', notif.id)
        failed++
        continue
      }

      const channelRec = channel as ChannelRecord

      // Get task details
      let task: TaskRecord | null = null
      if (notif.task_id) {
        const { data: taskData } = await supabase
          .from('tasks')
          .select('id, title, description, status, priority, assigned_to, project_id, intake_sender')
          .eq('id', notif.task_id)
          .single()
        task = taskData as TaskRecord | null
      }

      // Build notification content
      const { subject, body, htmlBody } = buildNotificationContent(
        task,
        notif.event_type,
        notif.previous_status,
        notif.new_status
      )

      // Deliver based on channel type
      let result: DeliveryResult

      switch (channelRec.channel_type) {
        case 'email':
          result = await deliverViaEmail(channelRec.config, subject, body, htmlBody, task)
          break
        case 'slack':
          result = await deliverViaSlack(channelRec.config, subject, body, task)
          break
        case 'telegram':
          result = await deliverViaTelegram(channelRec.config, subject, body, task)
          break
        case 'webhook':
          result = await deliverViaWebhook(channelRec.config, subject, body, notif, task)
          break
        case 'in_app':
          // In-app notifications are already stored in notification_log
          result = { success: true }
          break
        default:
          result = { success: false, error: `Unsupported channel type: ${channelRec.channel_type}` }
      }

      // Update notification status
      if (result.success) {
        await supabase
          .from('notification_log')
          .update({
            status: 'sent',
            subject,
            body,
            sent_at: new Date().toISOString(),
            external_id: result.externalId || null,
          })
          .eq('id', notif.id)

        // Update channel stats
        await supabase
          .from('notification_channels')
          .update({
            total_sent: (channelRec as Record<string, unknown>).total_sent ?
              ((channelRec as Record<string, unknown>).total_sent as number) + 1 : 1,
            last_sent_at: new Date().toISOString(),
          })
          .eq('id', channelRec.id)

        delivered++
      } else {
        // Set retry delay with exponential backoff
        const retryDelay = Math.min(60 * Math.pow(2, notif.attempts), 3600) // Max 1 hour
        const nextRetry = new Date(Date.now() + retryDelay * 1000).toISOString()

        const newStatus = notif.attempts + 1 >= notif.max_attempts ? 'failed' : 'pending'

        await supabase
          .from('notification_log')
          .update({
            status: newStatus,
            error: result.error,
            next_retry_at: newStatus === 'pending' ? nextRetry : null,
          })
          .eq('id', notif.id)

        failed++
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: notifications.length,
        delivered,
        failed,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Notification delivery error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
