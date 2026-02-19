// AgentPM Intake API — Unified inbound task creation endpoint
// Accepts tasks from email, Slack, Telegram, webhooks, and direct API calls
// Uses AI to parse raw content into structured tasks when needed

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { verifyApiKey as verifyApiKeyShared, type ApiKeyContext } from '../_shared/auth.ts'

// ─── Types ──────────────────────────────────────────────────────────────────

interface IntakeRequest {
  // Direct fields (structured input)
  title?: string
  description?: string
  priority?: 'critical' | 'high' | 'medium' | 'low'
  projectId?: string
  agentId?: string
  tags?: string[]

  // Raw content (for AI parsing)
  rawContent?: string
  subject?: string

  // Source tracking
  sourceType: 'email' | 'slack' | 'telegram' | 'webhook' | 'api' | 'voice'
  sourceId?: string
  senderAddress?: string
  senderName?: string

  // Channel routing
  channelId?: string        // Explicit channel ID
  webhookSlug?: string      // For webhook-based routing
  channelAddress?: string   // For email-based routing

  // Attachments
  attachments?: Array<{
    name: string
    size: number
    contentType: string
    storagePath?: string
  }>
}

interface IntakeResponse {
  success: boolean
  taskId?: string
  intakeLogId?: string
  parsedTitle?: string
  parsedPriority?: string
  error?: string
}

interface ChannelConfig {
  id: string
  accountId: string
  channelType: string
  defaultProjectId?: string
  defaultAgentId?: string
  defaultPriority: string
  defaultStatus: string
  autoParse: boolean
  autoAssign: boolean
  autoExecute: boolean
  isActive: boolean
  config: Record<string, unknown>
}

// ─── API Key Verification (delegates to shared auth module) ─────────────────

async function verifyApiKey(
  supabase: ReturnType<typeof createClient>,
  authHeader: string | null
): Promise<{ accountId: string; agentType?: string; agentId?: string; scopes?: string[] } | null> {
  return verifyApiKeyShared(supabase, authHeader)
}

// ─── Webhook Secret Verification ────────────────────────────────────────────

async function verifyWebhookSignature(
  req: Request,
  secretHash: string
): Promise<boolean> {
  const signature = req.headers.get('x-webhook-signature') ||
    req.headers.get('x-hub-signature-256')

  if (!signature || !secretHash) {
    return false
  }

  // For now, simple string comparison. In production, use HMAC-SHA256.
  return signature === secretHash
}

// ─── AI Task Parser ─────────────────────────────────────────────────────────

async function parseWithAI(
  rawContent: string,
  subject?: string,
  senderName?: string
): Promise<{
  title: string
  description: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  tags: string[]
  confidence: number
}> {
  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')

  if (!anthropicApiKey) {
    // Fallback: use subject as title, raw content as description
    return {
      title: subject || rawContent.slice(0, 100),
      description: rawContent,
      priority: 'medium',
      tags: [],
      confidence: 0.3,
    }
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250514',
        max_tokens: 500,
        system: `You are a task parser. Extract a structured task from raw input (email, message, etc.).
Return ONLY valid JSON with these fields:
- title: concise task title (max 100 chars)
- description: full task description in markdown
- priority: one of "critical", "high", "medium", "low"
- tags: array of relevant tags (max 5)
- confidence: 0.0-1.0 how confident you are in the parsing

Consider urgency words ("ASAP", "urgent", "deadline") for priority.
If it's a forwarded email, extract the actual task from the email content.
Strip email signatures, disclaimers, and forwarding headers from the description.`,
        messages: [
          {
            role: 'user',
            content: `Parse this into a task:\n\nSubject: ${subject || '(none)'}\nFrom: ${senderName || '(unknown)'}\n\n${rawContent}`,
          },
        ],
      }),
    })

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`)
    }

    const data = await response.json()
    const text = data.content?.[0]?.text || ''

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        title: parsed.title || subject || rawContent.slice(0, 100),
        description: parsed.description || rawContent,
        priority: ['critical', 'high', 'medium', 'low'].includes(parsed.priority)
          ? parsed.priority
          : 'medium',
        tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5) : [],
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
      }
    }
  } catch (error) {
    console.error('AI parsing failed:', error)
  }

  // Fallback on any failure
  return {
    title: subject || rawContent.slice(0, 100),
    description: rawContent,
    priority: 'medium',
    tags: [],
    confidence: 0.3,
  }
}

// ─── Resolve Channel ────────────────────────────────────────────────────────

async function resolveChannel(
  supabase: ReturnType<typeof createClient>,
  body: IntakeRequest,
  accountId?: string
): Promise<ChannelConfig | null> {
  // Strategy 1: Explicit channel ID
  if (body.channelId) {
    const { data } = await supabase
      .from('intake_channels')
      .select('*')
      .eq('id', body.channelId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .single()
    return data ? mapChannel(data) : null
  }

  // Strategy 2: Webhook slug
  if (body.webhookSlug) {
    const { data } = await supabase
      .from('intake_channels')
      .select('*')
      .eq('webhook_slug', body.webhookSlug)
      .eq('is_active', true)
      .is('deleted_at', null)
      .single()
    return data ? mapChannel(data) : null
  }

  // Strategy 3: Channel address (email)
  if (body.channelAddress) {
    const { data } = await supabase
      .from('intake_channels')
      .select('*')
      .eq('channel_address', body.channelAddress)
      .eq('is_active', true)
      .is('deleted_at', null)
      .single()
    return data ? mapChannel(data) : null
  }

  // Strategy 4: Find by account + source type
  if (accountId) {
    const { data } = await supabase
      .from('intake_channels')
      .select('*')
      .eq('account_id', accountId)
      .eq('channel_type', body.sourceType)
      .eq('is_active', true)
      .is('deleted_at', null)
      .limit(1)
      .single()
    return data ? mapChannel(data) : null
  }

  return null
}

function mapChannel(row: Record<string, unknown>): ChannelConfig {
  return {
    id: row.id as string,
    accountId: row.account_id as string,
    channelType: row.channel_type as string,
    defaultProjectId: row.default_project_id as string | undefined,
    defaultAgentId: row.default_agent_id as string | undefined,
    defaultPriority: (row.default_priority as string) || 'medium',
    defaultStatus: (row.default_status as string) || 'pending',
    autoParse: row.auto_parse as boolean ?? true,
    autoAssign: row.auto_assign as boolean ?? false,
    autoExecute: row.auto_execute as boolean ?? false,
    isActive: row.is_active as boolean,
    config: (row.config as Record<string, unknown>) || {},
  }
}

// ─── Main Intake Handler ────────────────────────────────────────────────────

async function handleIntake(
  supabase: ReturnType<typeof createClient>,
  body: IntakeRequest,
  accountId: string,
  channel: ChannelConfig | null
): Promise<IntakeResponse> {
  const now = new Date().toISOString()

  // 1. Create intake log entry
  const { data: logEntry, error: logError } = await supabase
    .from('intake_log')
    .insert({
      account_id: accountId,
      channel_id: channel?.id || null,
      source_type: body.sourceType,
      source_id: body.sourceId,
      sender_address: body.senderAddress,
      sender_name: body.senderName,
      raw_subject: body.subject,
      raw_body: body.rawContent || body.description,
      raw_payload: body as unknown,
      attachment_count: body.attachments?.length || 0,
      attachments: body.attachments || [],
      status: 'received',
      received_at: now,
    })
    .select()
    .single()

  if (logError) {
    console.error('Failed to create intake log:', logError)
    return { success: false, error: `Failed to log intake: ${logError.message}` }
  }

  // 2. Determine task fields — direct fields or AI parsing
  let title = body.title
  let description = body.description
  let priority = body.priority || (channel?.defaultPriority as 'critical' | 'high' | 'medium' | 'low') || 'medium'
  let tags = body.tags || []
  let parseConfidence = 1.0

  const needsParsing = !title && (body.rawContent || body.subject)
  const shouldParse = needsParsing && (channel?.autoParse !== false)

  if (shouldParse) {
    // Update log status to parsing
    await supabase
      .from('intake_log')
      .update({ status: 'parsing' })
      .eq('id', logEntry.id)

    const parsed = await parseWithAI(
      body.rawContent || body.description || '',
      body.subject,
      body.senderName
    )

    title = parsed.title
    description = parsed.description
    priority = parsed.priority
    tags = parsed.tags
    parseConfidence = parsed.confidence

    // Update log with parsed results
    await supabase
      .from('intake_log')
      .update({
        status: 'parsed',
        parsed_title: title,
        parsed_description: description,
        parsed_priority: priority,
        parsed_tags: tags,
        parse_confidence: parseConfidence,
        parsed_at: new Date().toISOString(),
      })
      .eq('id', logEntry.id)
  }

  // 3. If still no title, generate one
  if (!title) {
    title = body.subject || `Task from ${body.sourceType} — ${new Date().toLocaleDateString()}`
  }

  // 4. Determine assignment
  const projectId = body.projectId || channel?.defaultProjectId || null
  const agentId = body.agentId || channel?.defaultAgentId || null
  const taskStatus = channel?.defaultStatus || 'pending'

  // 4b. Resolve account owner for created_by (required NOT NULL UUID column)
  const { data: ownerRow } = await supabase
    .from('user_accounts')
    .select('user_id')
    .eq('account_id', accountId)
    .eq('role', 'owner')
    .limit(1)
    .single()
  const ownerId = ownerRow?.user_id || null

  // 5. Create the task
  const taskData: Record<string, unknown> = {
    account_id: accountId,
    title,
    description: description || body.rawContent || '',
    priority,
    status: taskStatus,
    tags,
    project_id: projectId,
    intake_channel_id: channel?.id || null,
    intake_log_id: logEntry.id,
    intake_sender: body.senderAddress || body.senderName || null,
    created_by: ownerId,
    created_by_type: 'user',
    updated_by: ownerId,
    updated_by_type: 'user',
    status_history: [
      {
        status: taskStatus,
        changedAt: now,
        changedBy: 'intake-api',
        changedByType: 'system',
        note: `Created via ${body.sourceType} intake${body.senderName ? ` from ${body.senderName}` : ''}`,
      },
    ],
  }

  // Assign to agent if specified or auto-assign is enabled
  if (agentId) {
    taskData.assigned_to = agentId
    taskData.assigned_to_type = 'agent'
  }

  // If auto-execute, set to queued so the task queue picks it up
  if (channel?.autoExecute && agentId) {
    taskData.status = 'queued'
    taskData.status_history = [
      {
        status: 'queued',
        changedAt: now,
        changedBy: 'intake-api',
        changedByType: 'system',
        note: `Auto-queued via ${body.sourceType} intake`,
      },
    ]
  }

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .insert(taskData)
    .select('id, title, priority, status')
    .single()

  if (taskError) {
    console.error('Failed to create task:', taskError)
    await supabase
      .from('intake_log')
      .update({ status: 'failed', error: taskError.message })
      .eq('id', logEntry.id)
    return { success: false, intakeLogId: logEntry.id, error: `Failed to create task: ${taskError.message}` }
  }

  // 6. Update intake log with task reference
  await supabase
    .from('intake_log')
    .update({ status: 'task_created', task_id: task.id })
    .eq('id', logEntry.id)

  // 7. Update channel stats
  if (channel?.id) {
    await supabase
      .from('intake_channels')
      .update({ last_received_at: now })
      .eq('id', channel.id)

    // Increment counter (RPC may not exist yet, that's OK)
    try {
      await supabase.rpc('increment_intake_channel_counter', {
        p_channel_id: channel.id,
      })
    } catch { /* ignore */ }
  }

  return {
    success: true,
    taskId: task.id,
    intakeLogId: logEntry.id,
    parsedTitle: title,
    parsedPriority: priority,
  }
}

// ─── Main Handler ───────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Only accept POST
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

    const body: IntakeRequest = await req.json()

    // ── Authentication ──────────────────────────────────────────────────
    // Three auth strategies:
    // 1. Bearer token (API key) — for direct API and programmatic access
    // 2. Webhook slug in URL — for webhook-based intake (secret verified separately)
    // 3. Supabase JWT — for authenticated UI calls

    let accountId: string | null = null

    const authHeader = req.headers.get('Authorization')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    // Strategy 0: Internal service-to-service call (service role key)
    // Used by intake-telegram, intake-email, intake-slack calling intake-task
    if (authHeader === `Bearer ${serviceRoleKey}` && serviceRoleKey) {
      // Trusted internal call — resolve accountId from the channel
      if (body.channelId) {
        const { data: ch } = await supabase
          .from('intake_channels')
          .select('account_id')
          .eq('id', body.channelId)
          .single()
        if (ch) accountId = ch.account_id
      }
    }

    // Try API key auth
    if (!accountId && authHeader?.startsWith('Bearer ')) {
      const apiKeyContext = await verifyApiKey(supabase, authHeader)
      if (apiKeyContext) {
        // Check scope
        const scopes = apiKeyContext.scopes || []
        if (scopes.length > 0 && !scopes.includes('intake:create')) {
          return new Response(
            JSON.stringify({ success: false, error: 'API key lacks intake:create scope' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        accountId = apiKeyContext.accountId
      }
    }

    // Try webhook slug routing (URL-based)
    const url = new URL(req.url)
    const slugMatch = url.pathname.match(/\/intake-task\/([a-zA-Z0-9_-]+)$/)
    if (slugMatch && !accountId) {
      const slug = slugMatch[1]
      const { data: channel } = await supabase
        .from('intake_channels')
        .select('account_id, config')
        .eq('webhook_slug', slug)
        .eq('is_active', true)
        .is('deleted_at', null)
        .single()

      if (channel) {
        // Verify webhook signature if secret is configured
        const secretHash = (channel.config as Record<string, unknown>)?.secret_hash as string
        if (secretHash) {
          const isValid = await verifyWebhookSignature(req, secretHash)
          if (!isValid) {
            return new Response(
              JSON.stringify({ success: false, error: 'Invalid webhook signature' }),
              { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
        }
        accountId = channel.account_id
        body.webhookSlug = slug
      }
    }

    // Try Supabase JWT (for UI-initiated intake)
    if (!accountId && authHeader?.startsWith('Bearer ')) {
      const { data: { user } } = await supabase.auth.getUser(
        authHeader.replace('Bearer ', '')
      )
      if (user) {
        // Get user's account
        const { data: userAccount } = await supabase
          .from('user_accounts')
          .select('account_id')
          .eq('user_id', user.id)
          .limit(1)
          .single()
        if (userAccount) {
          accountId = userAccount.account_id
        }
      }
    }

    if (!accountId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Validate required fields ────────────────────────────────────────
    if (!body.sourceType) {
      return new Response(
        JSON.stringify({ success: false, error: 'sourceType is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const hasContent = body.title || body.rawContent || body.subject || body.description
    if (!hasContent) {
      return new Response(
        JSON.stringify({ success: false, error: 'At least one of title, rawContent, subject, or description is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Resolve channel ─────────────────────────────────────────────────
    const channel = await resolveChannel(supabase, body, accountId)

    // ── Process intake ──────────────────────────────────────────────────
    const result = await handleIntake(supabase, body, accountId, channel)

    return new Response(
      JSON.stringify(result),
      {
        status: result.success ? 201 : 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Intake API error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
