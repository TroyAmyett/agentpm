// Agent Collaboration Tool Implementations
// create_skill, send_message, read_messages

import type { ToolResult } from '../types'
import { supabase } from '@/services/supabase/client'
import { sendMessage, readMessages } from '@/services/agents/messaging'
import type { MessageType } from '@/types/agentpm'

// ============================================================================
// CREATE SKILL
// ============================================================================

interface CreateSkillParams {
  name: string
  description?: string
  content: string
  category: string
  tags?: string[]
  accountId: string
  agentId?: string
}

export async function createSkillTool(params: CreateSkillParams): Promise<ToolResult> {
  if (!supabase) {
    return { success: false, error: 'Database not configured' }
  }

  try {
    // Generate a slug from the name
    const slug = params.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    const { data, error } = await supabase
      .from('skills')
      .insert({
        account_id: params.accountId,
        name: params.name,
        slug,
        description: params.description || null,
        content: params.content,
        category: params.category,
        tags: params.tags || [],
        source_type: 'local',
        is_enabled: true,
        is_org_shared: true,
        version: '1.0.0',
        created_by_agent_id: params.agentId || null,
      })
      .select('id, name, slug')
      .single()

    if (error) {
      return { success: false, error: `Failed to create skill: ${error.message}` }
    }

    return {
      success: true,
      data: {
        formatted: `Skill "${data.name}" created successfully (ID: ${data.id}, slug: ${data.slug}). It is now available for all agents to use.`,
        id: data.id,
        name: data.name,
        slug: data.slug,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: `Failed to create skill: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

// ============================================================================
// SEND MESSAGE
// ============================================================================

interface SendMessageParams {
  toId: string
  toType: 'agent' | 'user'
  messageType: string
  subject?: string
  content: string
  sessionId?: string
  inReplyTo?: string
  accountId: string
  fromId: string
  fromType: 'agent' | 'user'
}

export async function sendMessageTool(params: SendMessageParams): Promise<ToolResult> {
  try {
    const result = await sendMessage({
      accountId: params.accountId,
      fromId: params.fromId,
      fromType: params.fromType,
      toId: params.toId,
      toType: params.toType,
      messageType: params.messageType as MessageType,
      subject: params.subject,
      content: params.content,
      sessionId: params.sessionId,
      inReplyTo: params.inReplyTo,
      protocol: 'a2a',
    })

    if (!result) {
      return { success: false, error: 'Failed to send message' }
    }

    return {
      success: true,
      data: {
        formatted: `Message sent to ${params.toType} ${params.toId} (ID: ${result.id})`,
        messageId: result.id,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: `Failed to send message: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

// ============================================================================
// READ MESSAGES
// ============================================================================

interface ReadMessagesParams {
  unreadOnly?: boolean
  limit?: number
  sessionId?: string
  messageType?: string
  accountId: string
  recipientId: string
  recipientType: 'agent' | 'user'
}

export async function readMessagesTool(params: ReadMessagesParams): Promise<ToolResult> {
  try {
    const messages = await readMessages(
      params.accountId,
      params.recipientId,
      params.recipientType,
      {
        unreadOnly: params.unreadOnly !== false,
        limit: params.limit || 10,
        sessionId: params.sessionId,
        messageType: params.messageType as MessageType | undefined,
      }
    )

    if (messages.length === 0) {
      return {
        success: true,
        data: { formatted: 'No messages in your inbox.' },
      }
    }

    const formatted = messages
      .map((m) => {
        const from = `${m.from_type}:${m.from_id}`
        const time = new Date(m.created_at).toLocaleString()
        const subject = m.subject ? ` — ${m.subject}` : ''
        return `[${m.message_type}] From ${from}${subject} (${time}):\n${m.content}`
      })
      .join('\n\n---\n\n')

    return {
      success: true,
      data: {
        formatted: `${messages.length} message(s):\n\n${formatted}`,
        messages: messages.map((m) => ({
          id: m.id,
          from: `${m.from_type}:${m.from_id}`,
          messageType: m.message_type,
          subject: m.subject,
          content: m.content,
          createdAt: m.created_at,
          sessionId: m.session_id,
        })),
      },
    }
  } catch (err) {
    return {
      success: false,
      error: `Failed to read messages: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}
