// Action Log - Display agent reasoning and action history

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Brain,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  DollarSign,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  MessageSquare,
} from 'lucide-react'
import type { AgentAction, ActionAlternative } from '@/types/agentpm'

interface ActionLogProps {
  actions: AgentAction[]
  isLoading?: boolean
}

export function ActionLog({ actions, isLoading }: ActionLogProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (actions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-surface-500">
        <Brain size={32} className="mb-2 opacity-50" />
        <p className="text-sm">No actions recorded yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <AnimatePresence mode="popLayout">
        {actions.map((action) => (
          <ActionItem key={action.id} action={action} />
        ))}
      </AnimatePresence>
    </div>
  )
}

// Helper to check if alternatives exist
function hasAlternatives(alternatives: unknown): alternatives is ActionAlternative[] {
  return Array.isArray(alternatives) && alternatives.length > 0
}

// Alternatives Section Component
function AlternativesSection({ alternatives }: { alternatives?: ActionAlternative[] }) {
  if (!alternatives || alternatives.length === 0) {
    return null
  }
  return (
    <div>
      <h4 className="flex items-center gap-2 text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-2">
        <MessageSquare size={14} />
        Alternatives Considered
      </h4>
      <div className="space-y-2">
        {alternatives.map((alt, index) => (
          <div
            key={index}
            className="p-3 rounded-lg bg-surface-50 dark:bg-surface-900/50 text-sm"
          >
            <p className="font-medium text-surface-700 dark:text-surface-300">
              {alt.action}
            </p>
            <p className="text-surface-500 dark:text-surface-400 mt-1">
              <span className="text-surface-400">Reason:</span> {alt.reason}
            </p>
            <p className="text-surface-500 dark:text-surface-400">
              <span className="text-surface-400">Rejected because:</span>{' '}
              {alt.rejectedBecause}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

// Individual Action Item
interface ActionItemProps {
  action: {
    id: string
    action: string
    status: 'pending' | 'success' | 'failed' | 'cancelled'
    createdAt: string
    reasoning?: string
    alternatives?: ActionAlternative[]
    result?: unknown
    error?: string
    confidence?: number
    executionTimeMs?: number
    cost?: number
    tokensUsed?: number
    humanOverride?: boolean
    humanOverrideReason?: string
  }
}

function ActionItem({ action }: ActionItemProps) {
  const [expanded, setExpanded] = useState(false)

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const formatDuration = (ms?: number) => {
    if (!ms) return '-'
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  const formatCost = (cents?: number) => {
    if (!cents) return '-'
    if (cents < 100) return `${cents}¢`
    return `$${(cents / 100).toFixed(2)}`
  }

  const statusConfig = {
    pending: { icon: Clock, color: 'text-surface-400', bg: 'bg-surface-100 dark:bg-surface-700' },
    success: { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/20' },
    failed: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20' },
    cancelled: { icon: XCircle, color: 'text-surface-400', bg: 'bg-surface-100 dark:bg-surface-700' },
  }

  const config = statusConfig[action.status]
  const StatusIcon = config.icon

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className={`rounded-lg border overflow-hidden ${
        action.status === 'failed'
          ? 'border-red-200 dark:border-red-800'
          : 'border-surface-200 dark:border-surface-700'
      }`}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-start gap-3 p-3 text-left transition-colors ${config.bg} hover:opacity-90`}
      >
        <StatusIcon className={`flex-shrink-0 mt-0.5 ${config.color}`} size={18} />

        <div className="flex-1 min-w-0">
          <p className="font-medium text-surface-900 dark:text-surface-100">{action.action}</p>
          <div className="flex items-center gap-3 mt-1 text-xs text-surface-500 dark:text-surface-400">
            <span>{formatDateTime(action.createdAt)}</span>
            {action.executionTimeMs && (
              <span className="flex items-center gap-1">
                <Zap size={12} />
                {formatDuration(action.executionTimeMs)}
              </span>
            )}
            {action.cost && (
              <span className="flex items-center gap-1">
                <DollarSign size={12} />
                {formatCost(action.cost)}
              </span>
            )}
            {action.confidence && (
              <span className="flex items-center gap-1">
                <Brain size={12} />
                {(action.confidence * 100).toFixed(0)}%
              </span>
            )}
          </div>
        </div>

        {(action.reasoning || hasAlternatives(action.alternatives)) && (
          <div className="flex-shrink-0">
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        )}
      </button>

      {/* Expanded Content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-3 space-y-4 bg-white dark:bg-surface-800 border-t border-surface-200 dark:border-surface-700">
              {/* Reasoning */}
              {action.reasoning && (
                <div>
                  <h4 className="flex items-center gap-2 text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-2">
                    <Brain size={14} />
                    Reasoning
                  </h4>
                  <p className="text-sm text-surface-700 dark:text-surface-300 bg-surface-50 dark:bg-surface-900/50 p-3 rounded-lg">
                    {action.reasoning}
                  </p>
                </div>
              )}

              <AlternativesSection alternatives={action.alternatives} />

              {/* Result */}
              {action.result !== undefined && action.result !== null && (
                <div>
                  <h4 className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-2">
                    Result
                  </h4>
                  <pre className="text-xs p-3 rounded-lg bg-surface-50 dark:bg-surface-900/50 overflow-auto max-h-32">
                    {typeof action.result === 'string'
                      ? action.result
                      : JSON.stringify(action.result, null, 2)}
                  </pre>
                </div>
              )}

              {/* Error */}
              {action.error && (
                <div>
                  <h4 className="flex items-center gap-2 text-xs font-medium text-red-500 uppercase tracking-wider mb-2">
                    <AlertTriangle size={14} />
                    Error
                  </h4>
                  <p className="text-sm text-red-600 dark:text-red-400 p-3 rounded-lg bg-red-50 dark:bg-red-900/20">
                    {action.error}
                  </p>
                </div>
              )}

              {/* Human Override */}
              {action.humanOverride && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
                  <AlertTriangle size={16} className="text-yellow-600 dark:text-yellow-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
                      Human Override Applied
                    </p>
                    {action.humanOverrideReason && (
                      <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-0.5">
                        {action.humanOverrideReason}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Metrics */}
              {(action.tokensUsed || action.cost || action.executionTimeMs) && (
                <div className="flex items-center gap-4 pt-2 border-t border-surface-200 dark:border-surface-700 text-xs text-surface-500">
                  {action.tokensUsed && <span>Tokens: {action.tokensUsed.toLocaleString()}</span>}
                  {action.cost && <span>Cost: {formatCost(action.cost)}</span>}
                  {action.executionTimeMs && (
                    <span>Duration: {formatDuration(action.executionTimeMs)}</span>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
