// Task Card - Individual task display

import { motion } from 'framer-motion'
import { Calendar, User, Bot, Clock, ChevronRight } from 'lucide-react'
import type { Task } from '@/types/agentpm'
import { TaskStatusBadge } from './TaskStatusBadge'
import { TaskPriorityBadge } from './TaskPriorityBadge'

interface TaskCardProps {
  task: Task
  agentName?: string
  selected?: boolean
  onClick?: (taskId: string) => void
}

export function TaskCard({ task, agentName, selected, onClick }: TaskCardProps) {
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

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

  const isOverdue = task.dueAt && new Date(task.dueAt) < new Date() && task.status !== 'completed'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => onClick?.(task.id)}
      className={`bg-white dark:bg-surface-800 rounded-lg border p-4 cursor-pointer transition-all hover:shadow-md ${
        selected
          ? 'border-primary-500 ring-2 ring-primary-500/20'
          : 'border-surface-200 dark:border-surface-700 hover:border-surface-300 dark:hover:border-surface-600'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="font-medium text-surface-900 dark:text-surface-100 line-clamp-2">
          {task.title}
        </h3>
        <ChevronRight size={18} className="flex-shrink-0 text-surface-400" />
      </div>

      {/* Description */}
      {task.description && (
        <p className="text-sm text-surface-500 dark:text-surface-400 line-clamp-2 mb-3">
          {task.description}
        </p>
      )}

      {/* Badges */}
      <div className="flex items-center gap-2 mb-3">
        <TaskStatusBadge status={task.status} size="sm" />
        <TaskPriorityBadge priority={task.priority} size="sm" />
      </div>

      {/* Meta Info */}
      <div className="flex items-center gap-4 text-xs text-surface-500 dark:text-surface-400">
        {/* Assignee */}
        {task.assignedTo && (
          <div className="flex items-center gap-1">
            {task.assignedToType === 'agent' ? (
              <Bot size={14} />
            ) : (
              <User size={14} />
            )}
            <span>{agentName || 'Assigned'}</span>
          </div>
        )}

        {/* Due Date */}
        {task.dueAt && (
          <div className={`flex items-center gap-1 ${isOverdue ? 'text-red-500' : ''}`}>
            <Calendar size={14} />
            <span>{formatDate(task.dueAt)}</span>
          </div>
        )}

        {/* Updated */}
        <div className="flex items-center gap-1 ml-auto">
          <Clock size={14} />
          <span>{formatTimeAgo(task.updatedAt)}</span>
        </div>
      </div>
    </motion.div>
  )
}
