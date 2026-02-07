// Task Status Badge - Visual indicator for task status

import { Inbox, Zap, Clock, Play, Eye, CheckCircle2, XCircle, Ban } from 'lucide-react'
import type { TaskStatus } from '@/types/agentpm'

interface TaskStatusBadgeProps {
  status: TaskStatus
  size?: 'sm' | 'md' | 'lg'
}

const statusConfig: Record<TaskStatus, { color: string; bgColor: string; borderColor: string; label: string; icon: React.ReactNode }> = {
  draft: {
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/20',
    label: 'Inbox',
    icon: <Inbox size={12} />,
  },
  pending: {
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/10',
    borderColor: 'border-indigo-500/20',
    label: 'Ready',
    icon: <Zap size={12} />,
  },
  queued: {
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/20',
    label: 'Queued',
    icon: <Clock size={12} />,
  },
  in_progress: {
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/20',
    label: 'In Progress',
    icon: <Play size={12} />,
  },
  review: {
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/20',
    label: 'Review',
    icon: <Eye size={12} />,
  },
  completed: {
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/20',
    label: 'Completed',
    icon: <CheckCircle2 size={12} />,
  },
  failed: {
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/20',
    label: 'Failed',
    icon: <XCircle size={12} />,
  },
  cancelled: {
    color: 'text-surface-400',
    bgColor: 'bg-surface-500/10',
    borderColor: 'border-surface-500/20',
    label: 'Cancelled',
    icon: <Ban size={12} />,
  },
}

const sizeConfig = {
  sm: 'px-1.5 py-0.5 text-xs gap-1',
  md: 'px-2 py-0.5 text-xs gap-1',
  lg: 'px-2.5 py-1 text-sm gap-1.5',
}

export function TaskStatusBadge({ status, size = 'md' }: TaskStatusBadgeProps) {
  const config = statusConfig[status]
  const sizeClasses = sizeConfig[size]

  return (
    <span
      className={`inline-flex items-center rounded-md border font-medium ${config.bgColor} ${config.borderColor} ${config.color} ${sizeClasses}`}
    >
      {config.icon}
      {config.label}
    </span>
  )
}
