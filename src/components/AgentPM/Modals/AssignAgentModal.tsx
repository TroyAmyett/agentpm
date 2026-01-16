// Assign Agent Modal - Modal for assigning/reassigning tasks to agents

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Bot, CheckCircle2, Zap, Clock, Sparkles } from 'lucide-react'
import type { AgentPersona, Task } from '@/types/agentpm'
import { AgentStatusBadge } from '../Agents/AgentStatusBadge'

interface AssignAgentModalProps {
  isOpen: boolean
  onClose: () => void
  onAssign: (agentId: string) => Promise<void>
  task: Task
  agents: AgentPersona[]
  suggestedAgentId?: string
}

export function AssignAgentModal({
  isOpen,
  onClose,
  onAssign,
  task,
  agents,
  suggestedAgentId,
}: AssignAgentModalProps) {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(suggestedAgentId || null)
  const [isAssigning, setIsAssigning] = useState(false)

  const handleAssign = async () => {
    if (!selectedAgentId) return

    setIsAssigning(true)
    try {
      await onAssign(selectedAgentId)
      onClose()
    } catch (err) {
      console.error('Failed to assign agent:', err)
    } finally {
      setIsAssigning(false)
    }
  }

  const availableAgents = agents.filter(
    (a) => a.isActive && !a.pausedAt && a.healthStatus !== 'failing'
  )

  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

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

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white dark:bg-surface-800 rounded-xl shadow-xl z-50"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-surface-200 dark:border-surface-700">
              <div>
                <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
                  Assign Agent
                </h2>
                <p className="text-sm text-surface-500 dark:text-surface-400 mt-0.5">
                  {task.title}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-500 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Agent List */}
            <div className="p-4 space-y-2 max-h-96 overflow-auto">
              {availableAgents.length === 0 ? (
                <div className="text-center py-8 text-surface-500">
                  <Bot size={32} className="mx-auto mb-2 opacity-50" />
                  <p>No agents available</p>
                </div>
              ) : (
                availableAgents.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => setSelectedAgentId(agent.id)}
                    className={`w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all ${
                      selectedAgentId === agent.id
                        ? 'bg-primary-50 dark:bg-primary-900/20 border-2 border-primary-500'
                        : 'bg-surface-50 dark:bg-surface-900/50 border-2 border-transparent hover:border-surface-300 dark:hover:border-surface-600'
                    }`}
                  >
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
                        <span className="font-medium text-surface-900 dark:text-surface-100">
                          {agent.alias}
                        </span>
                        <AgentStatusBadge status={agent.healthStatus} size="sm" />
                        {suggestedAgentId === agent.id && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300">
                            <Sparkles size={12} />
                            Suggested
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
                        {agent.tagline || agent.agentType}
                      </p>

                      {/* Stats */}
                      <div className="flex items-center gap-3 mt-2 text-xs text-surface-500">
                        <span className="flex items-center gap-1">
                          <CheckCircle2 size={12} />
                          {agent.stats?.successRate || 100}%
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {formatTime(agent.stats?.avgExecutionTime || 0)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Zap size={12} />
                          {agent.stats?.tasksCompleted || 0} tasks
                        </span>
                      </div>
                    </div>

                    {/* Selection Indicator */}
                    {selectedAgentId === agent.id && (
                      <CheckCircle2 className="flex-shrink-0 text-primary-500" size={20} />
                    )}
                  </button>
                ))
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 p-4 border-t border-surface-200 dark:border-surface-700">
              <button
                onClick={onClose}
                disabled={isAssigning}
                className="px-4 py-2 rounded-lg text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAssign}
                disabled={!selectedAgentId || isAssigning}
                className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAssigning ? 'Assigning...' : 'Assign'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
