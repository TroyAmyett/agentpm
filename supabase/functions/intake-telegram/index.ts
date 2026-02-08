// AgentPM Telegram Intake — Receives Telegram Bot webhook updates
// Handles:
//   1. Direct messages to the bot → creates tasks
//   2. /task command → creates tasks with explicit command
//   3. /status command → shows recent task statuses

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// ─── Types ──────────────────────────────────────────────────────────────────

interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
}

interface TelegramMessage {
  message_id: number
  from?: {
    id: number
    is_bot: boolean
    first_name: string
    last_name?: string
    username?: string
  }
  chat: {
    id: number
    type: 'private' | 'group' | 'supergroup' | 'channel'
    title?: string
    username?: string
    first_name?: string
  }
  date: number
  text?: string
  caption?: string
  document?: {
    file_id: string
    file_name?: string
    file_size?: number
    mime_type?: string
  }
  photo?: Array<{
    file_id: string
    file_size?: number
    width: number
    height: number
  }>
}

// ─── Telegram API Helpers ───────────────────────────────────────────────────

async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string,
  parseMode: 'Markdown' | 'HTML' = 'Markdown'
) {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true,
      }),
    })
  } catch (err) {
    console.error('Failed to send Telegram message:', err)
  }
}

async function sendTelegramTyping(botToken: string, chatId: number) {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
    })
  } catch { /* ignore */ }
}

// ─── Command Handlers ───────────────────────────────────────────────────────

async function handleStatusCommand(
  supabase: ReturnType<typeof createClient>,
  botToken: string,
  chatId: number,
  accountId: string
) {
  // Get recent tasks
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, status, priority, updated_at')
    .eq('account_id', accountId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(5)

  if (!tasks || tasks.length === 0) {
    await sendTelegramMessage(botToken, chatId, 'No tasks found.')
    return
  }

  const statusEmoji: Record<string, string> = {
    draft: '📝',
    pending: '⏳',
    queued: '📥',
    in_progress: '⚙️',
    review: '👀',
    completed: '✅',
    failed: '❌',
    cancelled: '🚫',
  }

  const appUrl = Deno.env.get('APP_URL') || 'https://agentpm.funnelists.com'
  const lines = tasks.map((t: Record<string, unknown>) => {
    const emoji = statusEmoji[t.status as string] || '📋'
    return `${emoji} *${t.title}* — ${t.status}\n   [View](${appUrl}/#agentpm/tasks?task=${t.id})`
  })

  await sendTelegramMessage(
    botToken,
    chatId,
    `*Recent Tasks:*\n\n${lines.join('\n\n')}`
  )
}

async function handleHelpCommand(botToken: string, chatId: number) {
  await sendTelegramMessage(
    botToken,
    chatId,
    [
      '*AgentPM Bot Commands:*',
      '',
      '📋 Just send a message → Creates a task',
      '`/task <description>` → Creates a task explicitly',
      '`/status` → Shows 5 most recent tasks',
      '`/help` → Shows this help message',
      '',
      'You can also forward messages to me and I\'ll create tasks from them.',
    ].join('\n')
  )
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

    const update: TelegramUpdate = await req.json()
    const message = update.message

    if (!message || !message.text) {
      // Silently ignore non-text updates
      return new Response('ok')
    }

    // Ignore bot messages
    if (message.from?.is_bot) {
      return new Response('ok')
    }

    const chatId = message.chat.id
    const text = message.text.trim()
    const senderId = message.from?.id?.toString() || 'unknown'
    const senderName = [
      message.from?.first_name,
      message.from?.last_name,
    ].filter(Boolean).join(' ') || message.from?.username || 'Unknown'

    // Find intake channel by chat ID
    const { data: channels } = await supabase
      .from('intake_channels')
      .select('id, account_id, config')
      .eq('channel_type', 'telegram')
      .eq('is_active', true)
      .is('deleted_at', null)

    const matchingChannel = (channels || []).find(ch => {
      const config = ch.config as Record<string, unknown>
      return config.chat_id?.toString() === chatId.toString()
    })

    if (!matchingChannel) {
      // Check if we have any Telegram channels at all (for registration flow)
      const anyChannel = (channels || []).find(ch => {
        const config = ch.config as Record<string, unknown>
        return !config.chat_id // Unregistered channel
      })

      if (anyChannel) {
        // Auto-register this chat with the first unconfigured Telegram channel
        const config = anyChannel.config as Record<string, unknown>
        await supabase
          .from('intake_channels')
          .update({
            config: { ...config, chat_id: chatId.toString() },
            verified_at: new Date().toISOString(),
          })
          .eq('id', anyChannel.id)

        const botToken = config.bot_token_enc as string
        if (botToken) {
          await sendTelegramMessage(
            botToken,
            chatId,
            '✅ *AgentPM Connected!*\n\nThis chat is now linked to your AgentPM account. Send me any message and I\'ll create a task from it.\n\nType /help for available commands.'
          )
        }
        return new Response('ok')
      }

      // No matching channel at all — ignore silently
      return new Response('ok')
    }

    const channelConfig = matchingChannel.config as Record<string, unknown>
    const botToken = channelConfig.bot_token_enc as string
    const accountId = matchingChannel.account_id

    if (!botToken) {
      return new Response('ok')
    }

    // ── Handle commands ─────────────────────────────────────────────────
    if (text.startsWith('/')) {
      const [command, ...args] = text.split(' ')
      const commandText = args.join(' ').trim()

      switch (command.split('@')[0]) { // Strip @botname suffix
        case '/start':
        case '/help':
          await handleHelpCommand(botToken, chatId)
          return new Response('ok')

        case '/status':
          await sendTelegramTyping(botToken, chatId)
          await handleStatusCommand(supabase, botToken, chatId, accountId)
          return new Response('ok')

        case '/task':
          if (!commandText) {
            await sendTelegramMessage(
              botToken,
              chatId,
              'Usage: `/task <description>`\nExample: `/task Research competitor pricing`'
            )
            return new Response('ok')
          }
          // Fall through to task creation with commandText
          break

        default:
          await sendTelegramMessage(
            botToken,
            chatId,
            `Unknown command. Type /help for available commands.`
          )
          return new Response('ok')
      }
    }

    // ── Create task from message ────────────────────────────────────────
    await sendTelegramTyping(botToken, chatId)

    // Get the actual task text (from /task command or direct message)
    const taskText = text.startsWith('/task ')
      ? text.slice(6).trim()
      : text

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    const intakeResponse = await fetch(`${supabaseUrl}/functions/v1/intake-task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        sourceType: 'telegram',
        sourceId: message.message_id.toString(),
        senderAddress: senderId,
        senderName,
        rawContent: taskText,
        channelId: matchingChannel.id,
      }),
    })

    const result = await intakeResponse.json()
    const appUrl = Deno.env.get('APP_URL') || 'https://agentpm.funnelists.com'

    if (result.success) {
      await sendTelegramMessage(
        botToken,
        chatId,
        [
          `✅ *Task Created*`,
          '',
          `*${result.parsedTitle}*`,
          `Priority: ${result.parsedPriority || 'medium'}`,
          '',
          `[View in AgentPM](${appUrl}/#agentpm/tasks?task=${result.taskId})`,
        ].join('\n')
      )
    } else {
      await sendTelegramMessage(
        botToken,
        chatId,
        `❌ Failed to create task: ${result.error}`
      )
    }

    return new Response('ok')
  } catch (error) {
    console.error('Telegram intake error:', error)
    return new Response('ok') // Always return ok to Telegram to prevent retries
  }
})
