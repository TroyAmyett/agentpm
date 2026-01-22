// Task Status Badge - Visual indicator for task status

import type { TaskStatus } from '@/types/agentpm'

interface TaskStatusBadgeProps {
  status: TaskStatus
  size?: 'sm' | 'md' | 'lg'
}

const statusConfig: Record<TaskStatus, { color: string; bgColor: string; label: string }> = {
  draft: {
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    label: 'Inbox',
  },
  pending: {
    color: 'text-indigo-600 dark:text-indigo-400',
    bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
    label: 'Ready',
  },
  queued: {
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    label: 'Queued',
  },
  in_progress: {
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    label: 'In Progress',
  },
  review: {
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    label: 'Review',
  },
  completed: {
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    label: 'Completed',
  },
  failed: {
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    label: 'Failed',
  },
  cancelled: {
    color: 'text-surface-500 dark:text-surface-500',
    bgColor: 'bg-surface-100 dark:bg-surface-800',
    label: 'Cancelled',
  },
}

const sizeConfig = {
  sm: 'px-1.5 py-0.5 text-xs',
  md: 'px-2 py-0.5 text-xs',
  lg: 'px-2.5 py-1 text-sm',
}

export function TaskStatusBadge({ status, size = 'md' }: TaskStatusBadgeProps) {
  const config = statusConfig[status]
  const sizeClasses = sizeConfig[size]

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${config.bgColor} ${config.color} ${sizeClasses}`}
    >
      {config.label}
    </span>
  )
}
