// Agent Detail Modal - View and manage agent details

import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Bot,
  Pause,
  Play,
  RefreshCw,
  Zap,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Shield,
  Target,
} from 'lucide-react'
import type { AgentPersona } from '@/types/agentpm'
import { AgentStatusBadge } from '../Agents/AgentStatusBadge'

interface AgentDetailModalProps {
  isOpen: boolean
  onClose: () => void
  agent: AgentPersona
  onPause: (agentId: string) => Promise<void>
  onResume: (agentId: string) => Promise<void>
  onResetHealth: (agentId: string) => Promise<void>
  onAssignTask: (agentId: string) => void
}

export function AgentDetailModal({
  isOpen,
  onClose,
  agent,
  onPause,
  onResume,
  onResetHealth,
  onAssignTask,
}: AgentDetailModalProps) {
  const isPaused = !!agent.pausedAt

  // Generate a consistent color based on agent type
  const agentTypeColors: Record<string, string> = {
    'Project Manager': '#6366f1',
    'Research': '#8b5cf6',
    'Writing': '#ec4899',
    'Review': '#f59e0b',
    'Data Analysis': '#10b981',
    'Custom': '#64748b',
  }
  const agentColor = agentTypeColors[agent.agentType] || '#6366f1'

  const stats = agent.stats || {
    tasksCompleted: 0,
    tasksFailed: 0,
    avgExecutionTime: 0,
    successRate: 0,
  }

  const formatDuration = (ms: number) => {
    if (ms < 60000) return `${Math.round(ms / 1000)}s`
    if (ms < 3600000) return `${Math.round(ms / 60000)}m`
    return `${(ms / 3600000).toFixed(1)}h`
  }

  const autonomyConfig = {
    supervised: {
      label: 'Supervised',
      description: 'Requires approval for all actions',
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
    },
    'semi-autonomous': {
      label: 'Semi-Autonomous',
      description: 'Can act within defined boundaries',
      color: 'text-yellow-600 dark:text-yellow-400',
      bg: 'bg-yellow-50 dark:bg-yellow-900/20',
    },
    autonomous: {
      label: 'Autonomous',
      description: 'Full autonomy within trust limits',
      color: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-50 dark:bg-green-900/20',
    },
  }

  const autonomy = autonomyConfig[agent.autonomyLevel]

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-50"
          />

          {/* Modal Container - Flexbox centering */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="w-full max-w-2xl max-h-[90vh] bg-white dark:bg-surface-800 rounded-xl shadow-xl flex flex-col overflow-hidden pointer-events-auto">
            {/* Header */}
            <div className="flex items-start justify-between p-6 border-b border-surface-200 dark:border-surface-700 flex-shrink-0">
              <div className="flex items-center gap-4">
                <div
                  className="w-16 h-16 rounded-xl flex items-center justify-center text-3xl"
                  style={{ backgroundColor: agentColor + '20' }}
                >
                  {agent.avatar || <Bot size={32} style={{ color: agentColor }} />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold text-surface-900 dark:text-surface-100">
                      {agent.alias}
                    </h2>
                    <AgentStatusBadge status={agent.healthStatus} paused={isPaused} />
                  </div>
                  <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
                    {agent.agentType} Agent
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-500 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6 space-y-6">
              {/* Description */}
              {agent.description && (
                <div>
                  <h3 className="text-sm font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-2">
                    Description
                  </h3>
                  <p className="text-surface-700 dark:text-surface-300">
                    {agent.description}
                  </p>
                </div>
              )}

              {/* Autonomy Level */}
              <div>
                <h3 className="text-sm font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-2">
                  Autonomy Level
                </h3>
                <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg ${autonomy.bg}`}>
                  <Shield size={16} className={autonomy.color} />
                  <div>
                    <p className={`font-medium ${autonomy.color}`}>{autonomy.label}</p>
                    <p className="text-xs text-surface-500">{autonomy.description}</p>
                  </div>
                </div>
              </div>

              {/* Capabilities */}
              {agent.capabilities && agent.capabilities.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-2">
                    Capabilities
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {agent.capabilities.map((cap) => (
                      <span
                        key={cap}
                        className="px-2 py-1 text-sm rounded-md bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-400"
                      >
                        {cap}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Stats */}
              <div>
                <h3 className="text-sm font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-3">
                  Performance
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-3 rounded-lg bg-surface-50 dark:bg-surface-900/50">
                    <div className="flex items-center gap-2 text-green-500 mb-1">
                      <CheckCircle2 size={16} />
                      <span className="text-xs font-medium uppercase">Completed</span>
                    </div>
                    <p className="text-2xl font-bold text-surface-900 dark:text-surface-100">
                      {stats.tasksCompleted}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-surface-50 dark:bg-surface-900/50">
                    <div className="flex items-center gap-2 text-red-500 mb-1">
                      <XCircle size={16} />
                      <span className="text-xs font-medium uppercase">Failed</span>
                    </div>
                    <p className="text-2xl font-bold text-surface-900 dark:text-surface-100">
                      {stats.tasksFailed}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-surface-50 dark:bg-surface-900/50">
                    <div className="flex items-center gap-2 text-primary-500 mb-1">
                      <Target size={16} />
                      <span className="text-xs font-medium uppercase">Success Rate</span>
                    </div>
                    <p className="text-2xl font-bold text-surface-900 dark:text-surface-100">
                      {(stats.successRate * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-surface-50 dark:bg-surface-900/50">
                    <div className="flex items-center gap-2 text-surface-500 mb-1">
                      <Clock size={16} />
                      <span className="text-xs font-medium uppercase">Avg Time</span>
                    </div>
                    <p className="text-2xl font-bold text-surface-900 dark:text-surface-100">
                      {stats.avgExecutionTime ? formatDuration(stats.avgExecutionTime) : '-'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Trust Score */}
              {agent.trustScore !== undefined && (
                <div>
                  <h3 className="text-sm font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-2">
                    Trust Score
                  </h3>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 rounded-full bg-surface-200 dark:bg-surface-700 overflow-hidden">
                      <div
                        className="h-full bg-primary-500 rounded-full transition-all"
                        style={{ width: `${agent.trustScore * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-surface-700 dark:text-surface-300">
                      {(agent.trustScore * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              )}

              {/* Health Warning */}
              {agent.healthStatus === 'failing' && (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <AlertTriangle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
                  <div>
                    <p className="font-medium text-red-700 dark:text-red-400">
                      Agent Health Critical
                    </p>
                    <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                      This agent has failed {agent.consecutiveFailures || 0} consecutive tasks.
                      Consider resetting health or investigating the issue.
                    </p>
                  </div>
                </div>
              )}

              {isPaused && (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
                  <Pause className="text-yellow-500 flex-shrink-0 mt-0.5" size={20} />
                  <div>
                    <p className="font-medium text-yellow-700 dark:text-yellow-400">
                      Agent Paused
                    </p>
                    <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">
                      {agent.pauseReason || 'This agent is currently paused and will not process new tasks.'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between p-4 border-t border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900/50">
              <div className="flex items-center gap-2">
                {isPaused ? (
                  <button
                    onClick={() => onResume(agent.id)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                  >
                    <Play size={16} />
                    Resume Agent
                  </button>
                ) : (
                  <button
                    onClick={() => onPause(agent.id)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-200 dark:hover:bg-yellow-900/50 transition-colors"
                  >
                    <Pause size={16} />
                    Pause Agent
                  </button>
                )}
                {agent.healthStatus !== 'healthy' && (
                  <button
                    onClick={() => onResetHealth(agent.id)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-600 transition-colors"
                  >
                    <RefreshCw size={16} />
                    Reset Health
                  </button>
                )}
              </div>
              <button
                onClick={() => {
                  onAssignTask(agent.id)
                  onClose()
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium transition-colors"
              >
                <Zap size={16} />
                Assign Task
              </button>
            </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
