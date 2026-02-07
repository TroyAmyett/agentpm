// Agent Messages Inbox — View A2A and agent-to-user messages

import { useState, useEffect, useCallback } from 'react'
import { MessageSquare, RefreshCw, Filter, ChevronDown, ChevronRight } from 'lucide-react'
import { supabase } from '@/services/supabase/client'
import type { AgentPersona } from '@/types/agentpm'

interface AgentMessage {
  id: string
  accountId: string
  fromId: string
  fromType: 'agent' | 'user'
  toId: string
  toType: 'agent' | 'user'
  messageType: string
  subject: string | null
  content: string
  sessionId: string | null
  inReplyTo: string | null
  protocol: string
  status: string
  readAt: string | null
  createdAt: string
}

interface MessagesPageProps {
  accountId: string
  agents: AgentPersona[]
}

type FilterType = 'all' | 'request' | 'response' | 'broadcast' | 'alert' | 'status'

export function MessagesPage({ accountId, agents }: MessagesPageProps) {
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterType>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const agentMap = new Map(agents.map(a => [a.id, a]))

  const fetchMessages = useCallback(async () => {
    if (!supabase || !accountId) return
    setLoading(true)
    try {
      let query = supabase
        .from('agent_messages')
        .select('*')
        .eq('account_id', accountId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(100)

      if (filter !== 'all') {
        query = query.eq('message_type', filter)
      }

      const { data, error } = await query
      if (error) throw error

      setMessages((data || []).map(row => ({
        id: row.id,
        accountId: row.account_id,
        fromId: row.from_id,
        fromType: row.from_type,
        toId: row.to_id,
        toType: row.to_type,
        messageType: row.message_type,
        subject: row.subject,
        content: row.content,
        sessionId: row.session_id,
        inReplyTo: row.in_reply_to,
        protocol: row.protocol,
        status: row.status,
        readAt: row.read_at,
        createdAt: row.created_at,
      })))
    } catch (err) {
      console.error('Failed to fetch messages:', err)
    } finally {
      setLoading(false)
    }
  }, [accountId, filter])

  useEffect(() => {
    fetchMessages()
  }, [fetchMessages])

  const getActorName = (id: string, type: 'agent' | 'user') => {
    if (type === 'user') return 'You'
    const agent = agentMap.get(id)
    return agent?.alias || id.slice(0, 8)
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'request': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
      case 'response': return 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
      case 'broadcast': return 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
      case 'alert': return 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
      case 'status': return 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
      default: return 'bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-400'
    }
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr}h ago`
    return d.toLocaleDateString()
  }

  const FILTERS: { value: FilterType; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'request', label: 'Requests' },
    { value: 'response', label: 'Responses' },
    { value: 'broadcast', label: 'Broadcasts' },
    { value: 'alert', label: 'Alerts' },
    { value: 'status', label: 'Status' },
  ]

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center">
              <MessageSquare className="text-indigo-500" size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100">
                Agent Messages
              </h1>
              <p className="text-surface-500">
                Agent-to-agent communication log
              </p>
            </div>
          </div>
          <button
            onClick={fetchMessages}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mb-4">
          <Filter size={16} className="text-surface-400" />
          {FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                filter === f.value
                  ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                  : 'bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-600'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Messages */}
        {loading && messages.length === 0 ? (
          <div className="text-center py-12 text-surface-500">
            <RefreshCw size={32} className="mx-auto mb-3 animate-spin opacity-50" />
            <p>Loading messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12 text-surface-500">
            <MessageSquare size={48} className="mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No messages yet</p>
            <p className="text-sm">Agent messages will appear here as agents communicate during task execution</p>
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map(msg => {
              const isExpanded = expandedId === msg.id
              return (
                <div
                  key={msg.id}
                  className="bg-white dark:bg-surface-800 rounded-lg border border-surface-200 dark:border-surface-700 overflow-hidden"
                >
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : msg.id)}
                    className="w-full flex items-center gap-3 p-3 text-left hover:bg-surface-50 dark:hover:bg-surface-750 transition-colors"
                  >
                    {isExpanded ? <ChevronDown size={16} className="text-surface-400 flex-shrink-0" /> : <ChevronRight size={16} className="text-surface-400 flex-shrink-0" />}
                    <span className={`px-2 py-0.5 text-xs rounded-full flex-shrink-0 ${getTypeColor(msg.messageType)}`}>
                      {msg.messageType}
                    </span>
                    <span className="text-sm font-medium text-surface-900 dark:text-surface-100 flex-shrink-0">
                      {getActorName(msg.fromId, msg.fromType)}
                    </span>
                    <span className="text-surface-400 text-xs flex-shrink-0">&rarr;</span>
                    <span className="text-sm text-surface-600 dark:text-surface-300 flex-shrink-0">
                      {getActorName(msg.toId, msg.toType)}
                    </span>
                    {msg.subject && (
                      <span className="text-sm text-surface-500 truncate flex-1 min-w-0">
                        &mdash; {msg.subject}
                      </span>
                    )}
                    {!msg.subject && (
                      <span className="text-sm text-surface-400 truncate flex-1 min-w-0">
                        {msg.content.slice(0, 60)}{msg.content.length > 60 ? '...' : ''}
                      </span>
                    )}
                    <span className="text-xs text-surface-400 flex-shrink-0 ml-auto">
                      {formatTime(msg.createdAt)}
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-3 border-t border-surface-100 dark:border-surface-700">
                      <div className="pt-3 text-sm text-surface-700 dark:text-surface-300 whitespace-pre-wrap">
                        {msg.content}
                      </div>
                      <div className="flex gap-4 mt-3 text-xs text-surface-400">
                        <span>Protocol: {msg.protocol}</span>
                        <span>Status: {msg.status}</span>
                        {msg.sessionId && <span>Session: {msg.sessionId.slice(0, 8)}</span>}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
