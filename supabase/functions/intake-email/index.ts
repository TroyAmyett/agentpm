// AgentPM Email Intake — Inbound email webhook handler
// Receives forwarded emails from Resend/SendGrid/Mailgun inbound parse
// and routes them to the unified intake-task function

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// ─── Types ──────────────────────────────────────────────────────────────────

// SendGrid Inbound Parse webhook payload
interface SendGridInboundPayload {
  to: string
  from: string
  sender_ip?: string
  subject: string
  text?: string
  html?: string
  attachments?: string          // Number of attachments as string
  'attachment-info'?: string    // JSON with attachment metadata
  envelope?: string             // JSON with from/to
  charsets?: string
  SPF?: string
  dkim?: string
}

// Resend Inbound webhook payload
interface ResendInboundPayload {
  from: string
  to: string[]
  subject: string
  text?: string
  html?: string
  message_id?: string
  attachments?: Array<{
    filename: string
    content_type: string
    size: number
    content?: string  // Base64 encoded
  }>
}

// Generic normalized email
interface NormalizedEmail {
  from: string
  fromName?: string
  to: string
  subject: string
  textBody: string
  htmlBody?: string
  messageId?: string
  attachments: Array<{
    name: string
    size: number
    contentType: string
  }>
}

// ─── Email Parsing ──────────────────────────────────────────────────────────

function extractNameAndEmail(fromField: string): { name?: string; email: string } {
  // "John Doe <john@example.com>" → { name: "John Doe", email: "john@example.com" }
  const match = fromField.match(/^(.+?)\s*<(.+?)>$/)
  if (match) {
    return { name: match[1].trim().replace(/^"|"$/g, ''), email: match[2] }
  }
  return { email: fromField.trim() }
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function normalizeFromSendGrid(payload: SendGridInboundPayload): NormalizedEmail {
  const { name, email } = extractNameAndEmail(payload.from)
  const attachments: NormalizedEmail['attachments'] = []

  if (payload['attachment-info']) {
    try {
      const info = JSON.parse(payload['attachment-info'])
      for (const key of Object.keys(info)) {
        attachments.push({
          name: info[key].filename || key,
          size: info[key].size || 0,
          contentType: info[key].type || 'application/octet-stream',
        })
      }
    } catch { /* ignore parse errors */ }
  }

  return {
    from: email,
    fromName: name,
    to: payload.to,
    subject: payload.subject || '(no subject)',
    textBody: payload.text || stripHtmlToText(payload.html || ''),
    htmlBody: payload.html,
    attachments,
  }
}

function normalizeFromResend(payload: ResendInboundPayload): NormalizedEmail {
  const { name, email } = extractNameAndEmail(payload.from)

  return {
    from: email,
    fromName: name,
    to: (payload.to || []).join(', '),
    subject: payload.subject || '(no subject)',
    textBody: payload.text || stripHtmlToText(payload.html || ''),
    htmlBody: payload.html,
    messageId: payload.message_id,
    attachments: (payload.attachments || []).map(a => ({
      name: a.filename,
      size: a.size,
      contentType: a.content_type,
    })),
  }
}

// ─── Channel Resolution ────────────────────────────────────────────────────

async function findChannelByAddress(
  supabase: ReturnType<typeof createClient>,
  toAddress: string
): Promise<{ channelId: string; accountId: string } | null> {
  // Try exact match first
  const { data } = await supabase
    .from('intake_channels')
    .select('id, account_id')
    .eq('channel_type', 'email')
    .eq('channel_address', toAddress.toLowerCase())
    .eq('is_active', true)
    .is('deleted_at', null)
    .single()

  if (data) {
    return { channelId: data.id, accountId: data.account_id }
  }

  // Try matching with + addressing (tasks+abc123@domain → tasks+abc123@domain)
  // Also try the base address without the + part
  const plusMatch = toAddress.match(/^(.+?)\+(.+?)@(.+)$/)
  if (plusMatch) {
    const slug = plusMatch[2]
    const { data: slugData } = await supabase
      .from('intake_channels')
      .select('id, account_id')
      .eq('channel_type', 'email')
      .eq('webhook_slug', slug)
      .eq('is_active', true)
      .is('deleted_at', null)
      .single()

    if (slugData) {
      return { channelId: slugData.id, accountId: slugData.account_id }
    }
  }

  return null
}

// ─── Main Handler ───────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
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

    // Detect provider format from Content-Type and payload shape
    const contentType = req.headers.get('content-type') || ''
    let email: NormalizedEmail

    if (contentType.includes('application/json')) {
      // Resend format (JSON)
      const payload: ResendInboundPayload = await req.json()
      email = normalizeFromResend(payload)
    } else if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
      // SendGrid format (form data)
      const formData = await req.formData()
      const payload: SendGridInboundPayload = {
        to: formData.get('to') as string || '',
        from: formData.get('from') as string || '',
        subject: formData.get('subject') as string || '',
        text: formData.get('text') as string || undefined,
        html: formData.get('html') as string || undefined,
        attachments: formData.get('attachments') as string || undefined,
        'attachment-info': formData.get('attachment-info') as string || undefined,
        envelope: formData.get('envelope') as string || undefined,
      }
      email = normalizeFromSendGrid(payload)
    } else {
      // Try JSON as default
      try {
        const payload = await req.json()
        // Detect by field names
        if (Array.isArray(payload.to)) {
          email = normalizeFromResend(payload)
        } else {
          email = normalizeFromSendGrid(payload)
        }
      } catch {
        return new Response(
          JSON.stringify({ success: false, error: 'Unsupported content type' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Find the intake channel by the "to" address
    // Parse multiple addresses (comma-separated)
    const toAddresses = email.to.split(',').map(addr => {
      const match = addr.match(/<(.+?)>/)
      return (match ? match[1] : addr).trim().toLowerCase()
    })

    let channelInfo: { channelId: string; accountId: string } | null = null
    for (const addr of toAddresses) {
      channelInfo = await findChannelByAddress(supabase, addr)
      if (channelInfo) break
    }

    if (!channelInfo) {
      console.error('No intake channel found for addresses:', toAddresses)
      return new Response(
        JSON.stringify({ success: false, error: 'No intake channel configured for this email address' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Forward to the unified intake-task function
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    const intakeResponse = await fetch(`${supabaseUrl}/functions/v1/intake-task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        sourceType: 'email',
        sourceId: email.messageId,
        senderAddress: email.from,
        senderName: email.fromName,
        subject: email.subject,
        rawContent: email.textBody,
        channelId: channelInfo.channelId,
        attachments: email.attachments,
      }),
    })

    const result = await intakeResponse.json()

    return new Response(
      JSON.stringify(result),
      {
        status: intakeResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Email intake error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
