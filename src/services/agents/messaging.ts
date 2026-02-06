// Agent-to-Agent (A2A) Messaging Service
// Enables agents to send messages to other agents or users
// Supports request/response, broadcast, alerts, and status updates

import { supabase } from '@/services/supabase/client'
import type { MessageType, MessageProtocol, MessageStatus } from '@/types/agentpm'

export interface SendMessageInput {
  accountId: string
  fromId: string
  fromType: 'agent' | 'user'
  toId: string
  toType: 'agent' | 'user'
  messageType: MessageType
  subject?: string
  content: string
  sessionId?: string
  inReplyTo?: string
  protocol?: MessageProtocol
}

export interface AgentMessageRow {
  id: string
  account_id: string
  from_id: string
  from_type: 'agent' | 'user'
  to_id: string
  to_type: 'agent' | 'user'
  message_type: MessageType
  subject: string | null
  content: string
  session_id: string | null
  in_reply_to: string | null
  protocol: MessageProtocol
  status: MessageStatus
  read_at: string | null
  created_at: string
}

/**
 * Send a message from one agent/user to another.
 */
export async function sendMessage(input: SendMessageInput): Promise<{ id: string } | null> {
  if (!supabase) {
    console.error('[A2A] Supabase not configured')
    return null
  }

  const { data, error } = await supabase
    .from('agent_messages')
    .insert({
      account_id: input.accountId,
      from_id: input.fromId,
      from_type: input.fromType,
      to_id: input.toId,
      to_type: input.toType,
      message_type: input.messageType,
      subject: input.subject || null,
      content: input.content,
      session_id: input.sessionId || null,
      in_reply_to: input.inReplyTo || null,
      protocol: input.protocol || 'a2a',
      status: 'sent',
    })
    .select('id')
    .single()

  if (error) {
    console.error('[A2A] Failed to send message:', error)
    return null
  }

  console.log(`[A2A] Message sent: ${input.fromType}:${input.fromId} → ${input.toType}:${input.toId} (${input.messageType})`)
  return { id: data.id }
}

/**
 * Read messages for an agent/user (inbox).
 * Marks returned messages as 'read'.
 */
export async function readMessages(
  accountId: string,
  recipientId: string,
  recipientType: 'agent' | 'user',
  options?: {
    unreadOnly?: boolean
    limit?: number
    sessionId?: string
    messageType?: MessageType
  }
): Promise<AgentMessageRow[]> {
  if (!supabase) return []

  let query = supabase
    .from('agent_messages')
    .select('*')
    .eq('account_id', accountId)
    .eq('to_id', recipientId)
    .eq('to_type', recipientType)
    .order('created_at', { ascending: false })
    .limit(options?.limit || 20)

  if (options?.unreadOnly) {
    query = query.is('read_at', null)
  }
  if (options?.sessionId) {
    query = query.eq('session_id', options.sessionId)
  }
  if (options?.messageType) {
    query = query.eq('message_type', options.messageType)
  }

  const { data, error } = await query

  if (error) {
    console.error('[A2A] Failed to read messages:', error)
    return []
  }

  const messages = (data || []) as AgentMessageRow[]

  // Mark unread messages as read
  const unreadIds = messages.filter(m => !m.read_at).map(m => m.id)
  if (unreadIds.length > 0) {
    await supabase
      .from('agent_messages')
      .update({ read_at: new Date().toISOString(), status: 'read' })
      .in('id', unreadIds)
  }

  return messages
}

/**
 * Broadcast a message to all agents in an account.
 */
export async function broadcastToAgents(
  accountId: string,
  fromId: string,
  fromType: 'agent' | 'user',
  content: string,
  subject?: string
): Promise<number> {
  if (!supabase) return 0

  // Get all active agents
  const { data: agents } = await supabase
    .from('agent_personas')
    .select('id')
    .eq('account_id', accountId)
    .eq('is_active', true)
    .is('deleted_at', null)

  if (!agents || agents.length === 0) return 0

  // Send message to each agent (excluding sender if agent)
  const recipients = agents.filter(a => !(fromType === 'agent' && a.id === fromId))

  const inserts = recipients.map(a => ({
    account_id: accountId,
    from_id: fromId,
    from_type: fromType,
    to_id: a.id,
    to_type: 'agent' as const,
    message_type: 'broadcast' as MessageType,
    subject: subject || null,
    content,
    protocol: 'a2a' as MessageProtocol,
    status: 'sent' as MessageStatus,
  }))

  const { error } = await supabase.from('agent_messages').insert(inserts)
  if (error) {
    console.error('[A2A] Broadcast failed:', error)
    return 0
  }

  console.log(`[A2A] Broadcast sent to ${recipients.length} agents`)
  return recipients.length
}

/**
 * Get conversation thread (all messages in a session).
 */
export async function getThread(
  accountId: string,
  sessionId: string
): Promise<AgentMessageRow[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('agent_messages')
    .select('*')
    .eq('account_id', accountId)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[A2A] Failed to get thread:', error)
    return []
  }

  return (data || []) as AgentMessageRow[]
}

/**
 * Get unread count for an agent/user.
 */
export async function getUnreadCount(
  accountId: string,
  recipientId: string,
  recipientType: 'agent' | 'user'
): Promise<number> {
  if (!supabase) return 0

  const { count, error } = await supabase
    .from('agent_messages')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('to_id', recipientId)
    .eq('to_type', recipientType)
    .is('read_at', null)

  if (error) return 0
  return count ?? 0
}
