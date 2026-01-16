// Agent Card - Full agent card display with capabilities, stats, and controls

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  User,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  DollarSign,
  Pause,
  Play,
  Settings,
  ListTodo,
  History,
  ChevronDown,
  ChevronUp,
  Bot,
} from 'lucide-react'
import type { AgentPersona } from '@/types/agentpm'
import { AgentStatusBadge } from './AgentStatusBadge'

interface AgentCardProps {
  agent: AgentPersona
  onAssignTask?: (agentId: string) => void
  onViewHistory?: (agentId: string) => void
  onConfigure?: (agentId: string) => void
  onPause?: (agentId: string) => void
  onResume?: (agentId: string) => void
}

export function AgentCard({
  agent,
  onAssignTask,
  onViewHistory,
  onConfigure,
  onPause,
  onResume,
}: AgentCardProps) {
  const [expanded, setExpanded] = useState(false)
  const isPaused = !!agent.pausedAt

  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  const formatCost = (cents: number) => {
    if (cents < 100) return `${cents}¢`
    return `$${(cents / 100).toFixed(2)}`
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white dark:bg-surface-800 rounded-xl border shadow-sm overflow-hidden ${
        isPaused
          ? 'border-surface-300 dark:border-surface-600 opacity-75'
          : 'border-surface-200 dark:border-surface-700'
      }`}
    >
      {/* Header */}
      <div className="p-4 border-b border-surface-100 dark:border-surface-700">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="w-12 h-12 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
            {agent.avatar ? (
              <img
                src={agent.avatar}
                alt={agent.alias}
                className="w-full h-full rounded-lg object-cover"
              />
            ) : (
              <Bot className="w-6 h-6 text-primary-600 dark:text-primary-400" />
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-surface-900 dark:text-surface-100">
                {agent.alias}
              </h3>
              <AgentStatusBadge status={agent.healthStatus} paused={isPaused} />
            </div>
            <p className="text-sm text-surface-500 dark:text-surface-400">
              {agent.tagline || agent.agentType}
            </p>
          </div>
        </div>
      </div>

      {/* Capabilities */}
      <div className="p-4 border-b border-surface-100 dark:border-surface-700">
        <h4 className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-2">
          Capabilities
        </h4>
        <div className="flex flex-wrap gap-1.5">
          {agent.capabilities.map((cap) => (
            <span
              key={cap}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300"
            >
              <CheckCircle2 size={12} />
              {cap}
            </span>
          ))}
          {agent.restrictions.map((res) => (
            <span
              key={res}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-surface-100 dark:bg-surface-700 text-surface-500 dark:text-surface-400"
            >
              <XCircle size={12} />
              {res}
            </span>
          ))}
        </div>
      </div>

      {/* Autonomy Section */}
      <div className="p-4 border-b border-surface-100 dark:border-surface-700">
        <h4 className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-2">
          Autonomy
        </h4>
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-surface-600 dark:text-surface-400">Level</span>
            <span className="font-medium text-surface-900 dark:text-surface-100 capitalize">
              {agent.autonomyLevel.replace('-', ' ')}
            </span>
          </div>
          {agent.requiresApproval.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-surface-600 dark:text-surface-400">Requires Approval</span>
              <span className="text-surface-500 dark:text-surface-400 text-xs">
                {agent.requiresApproval.join(', ')}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-surface-600 dark:text-surface-400">Rate Limit</span>
            <span className="font-medium text-surface-900 dark:text-surface-100">
              {agent.maxActionsPerHour || 50}/hour
            </span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="p-4 border-b border-surface-100 dark:border-surface-700">
        <h4 className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-2">
          Stats
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-green-500" />
            <div>
              <p className="text-sm font-medium text-surface-900 dark:text-surface-100">
                {agent.stats?.tasksCompleted || 0}
              </p>
              <p className="text-xs text-surface-500">Completed</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-primary-500" />
            <div>
              <p className="text-sm font-medium text-surface-900 dark:text-surface-100">
                {agent.stats?.successRate || 100}%
              </p>
              <p className="text-xs text-surface-500">Success Rate</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-surface-400" />
            <div>
              <p className="text-sm font-medium text-surface-900 dark:text-surface-100">
                {formatTime(agent.stats?.avgExecutionTime || 0)}
              </p>
              <p className="text-xs text-surface-500">Avg Time</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DollarSign size={16} className="text-surface-400" />
            <div>
              <p className="text-sm font-medium text-surface-900 dark:text-surface-100">
                {formatCost(agent.stats?.totalCost || 0)}
              </p>
              <p className="text-xs text-surface-500">Total Cost</p>
            </div>
          </div>
        </div>
      </div>

      {/* Reports To (Expandable) */}
      {agent.reportsTo && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full p-4 border-b border-surface-100 dark:border-surface-700 flex items-center justify-between hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <User size={16} className="text-surface-400" />
            <span className="text-sm text-surface-600 dark:text-surface-400">Reports To</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-surface-900 dark:text-surface-100">
              {agent.reportsTo.name || agent.reportsTo.id}
            </span>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </button>
      )}

      {/* Actions */}
      <div className="p-3 flex items-center justify-between gap-2 bg-surface-50 dark:bg-surface-900/50">
        <div className="flex gap-1">
          {isPaused ? (
            <button
              onClick={() => onResume?.(agent.id)}
              className="p-2 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 text-green-600 dark:text-green-400 transition-colors"
              title="Resume Agent"
            >
              <Play size={18} />
            </button>
          ) : (
            <button
              onClick={() => onPause?.(agent.id)}
              className="p-2 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-500 hover:text-yellow-600 dark:hover:text-yellow-400 transition-colors"
              title="Pause Agent"
            >
              <Pause size={18} />
            </button>
          )}
          <button
            onClick={() => onViewHistory?.(agent.id)}
            className="p-2 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-500 transition-colors"
            title="View History"
          >
            <History size={18} />
          </button>
          <button
            onClick={() => onConfigure?.(agent.id)}
            className="p-2 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-500 transition-colors"
            title="Configure"
          >
            <Settings size={18} />
          </button>
        </div>

        <button
          onClick={() => onAssignTask?.(agent.id)}
          disabled={isPaused || agent.healthStatus === 'failing'}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ListTodo size={16} />
          Assign Task
        </button>
      </div>
    </motion.div>
  )
}
