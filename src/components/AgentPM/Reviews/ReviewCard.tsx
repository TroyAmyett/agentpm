// Review Card - Card for a single pending review

import { motion } from 'framer-motion'
import { Bot, CheckCircle2, MessageSquare, Clock, ChevronRight } from 'lucide-react'
import type { Review, Task, AgentPersona } from '@/types/agentpm'

interface ReviewCardProps {
  review: Review
  task?: Task
  agent?: AgentPersona
  onClick?: (reviewId: string) => void
}

export function ReviewCard({ review, task, agent, onClick }: ReviewCardProps) {
  const formatTimeAgo = (dateStr: string) => {
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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => onClick?.(review.id)}
      className="bg-white dark:bg-surface-800 rounded-lg border border-surface-200 dark:border-surface-700 p-4 cursor-pointer hover:shadow-md hover:border-surface-300 dark:hover:border-surface-600 transition-all"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          {/* Agent Avatar */}
          <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
            {agent?.avatar ? (
              <img
                src={agent.avatar}
                alt={agent.alias}
                className="w-full h-full rounded-lg object-cover"
              />
            ) : (
              <Bot className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            )}
          </div>

          <div>
            <p className="text-sm text-surface-500 dark:text-surface-400">
              <span className="font-medium text-surface-900 dark:text-surface-100">
                {agent?.alias || 'Unknown Agent'}
              </span>{' '}
              completed a task
            </p>
            <p className="text-xs text-surface-400 flex items-center gap-1 mt-0.5">
              <Clock size={12} />
              {formatTimeAgo(review.createdAt)}
            </p>
          </div>
        </div>

        <ChevronRight size={18} className="flex-shrink-0 text-surface-400" />
      </div>

      {/* Task Title */}
      {task && (
        <h3 className="font-medium text-surface-900 dark:text-surface-100 mb-2">
          {task.title}
        </h3>
      )}

      {/* Task Output Preview */}
      {task?.output && (
        <div className="p-2 rounded bg-surface-50 dark:bg-surface-900/50 text-sm text-surface-600 dark:text-surface-400 line-clamp-2 mb-3">
          {typeof task.output === 'string'
            ? task.output
            : task.output.content
            ? String(task.output.content).substring(0, 150) + '...'
            : 'Output available'}
        </div>
      )}

      {/* Quick Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation()
            // Handle approve
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 text-sm font-medium hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
        >
          <CheckCircle2 size={14} />
          Approve
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            // Handle reject
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-400 text-sm font-medium hover:bg-surface-200 dark:hover:bg-surface-600 transition-colors"
        >
          <MessageSquare size={14} />
          Request Changes
        </button>
      </div>
    </motion.div>
  )
}
