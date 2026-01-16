// Agent Card Compact - Smaller card for dashboard grid view

import { motion } from 'framer-motion'
import { Bot, ListTodo } from 'lucide-react'
import type { AgentPersona } from '@/types/agentpm'
import { AgentStatusBadge } from './AgentStatusBadge'

interface AgentCardCompactProps {
  agent: AgentPersona
  selected?: boolean
  onSelect?: (agentId: string) => void
  onAssignTask?: (agentId: string) => void
}

export function AgentCardCompact({
  agent,
  selected,
  onSelect,
  onAssignTask,
}: AgentCardCompactProps) {
  const isPaused = !!agent.pausedAt

  const formatTimeAgo = (dateStr?: string) => {
    if (!dateStr) return 'Never'
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.02 }}
      onClick={() => onSelect?.(agent.id)}
      className={`bg-white dark:bg-surface-800 rounded-xl border p-4 cursor-pointer transition-all ${
        selected
          ? 'border-primary-500 ring-2 ring-primary-500/20'
          : 'border-surface-200 dark:border-surface-700 hover:border-surface-300 dark:hover:border-surface-600'
      } ${isPaused ? 'opacity-60' : ''}`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
          {agent.avatar ? (
            <img
              src={agent.avatar}
              alt={agent.alias}
              className="w-full h-full rounded-lg object-cover"
            />
          ) : (
            <Bot className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-surface-900 dark:text-surface-100 truncate">
              {agent.alias}
            </h3>
            <AgentStatusBadge status={agent.healthStatus} paused={isPaused} size="sm" />
          </div>
          <p className="text-xs text-surface-500 dark:text-surface-400 truncate">
            {agent.agentType}
          </p>
        </div>
      </div>

      {/* Stats Row */}
      <div className="flex items-center justify-between text-xs text-surface-500 dark:text-surface-400 mb-3">
        <span>{agent.stats?.tasksCompleted || 0} tasks</span>
        <span className="mx-1">•</span>
        <span>{agent.stats?.successRate || 100}%</span>
        <span className="mx-1">•</span>
        <span>{formatTimeAgo(agent.stats?.lastRunAt)}</span>
      </div>

      {/* Action */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onAssignTask?.(agent.id)
        }}
        disabled={isPaused || agent.healthStatus === 'failing'}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-surface-100 dark:bg-surface-700 hover:bg-surface-200 dark:hover:bg-surface-600 text-surface-700 dark:text-surface-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <ListTodo size={16} />
        Assign Task
      </button>
    </motion.div>
  )
}
