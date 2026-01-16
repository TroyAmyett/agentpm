// Task Priority Badge - Visual indicator for task priority

import { AlertTriangle, ArrowUp, Minus, ArrowDown } from 'lucide-react'
import type { TaskPriority } from '@/types/agentpm'

interface TaskPriorityBadgeProps {
  priority: TaskPriority
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
}

const priorityConfig: Record<
  TaskPriority,
  { color: string; bgColor: string; label: string; icon: React.ReactNode }
> = {
  critical: {
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    label: 'Critical',
    icon: <AlertTriangle size={12} />,
  },
  high: {
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    label: 'High',
    icon: <ArrowUp size={12} />,
  },
  medium: {
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    label: 'Medium',
    icon: <Minus size={12} />,
  },
  low: {
    color: 'text-surface-500 dark:text-surface-400',
    bgColor: 'bg-surface-100 dark:bg-surface-700',
    label: 'Low',
    icon: <ArrowDown size={12} />,
  },
}

const sizeConfig = {
  sm: 'px-1.5 py-0.5 text-xs gap-1',
  md: 'px-2 py-0.5 text-xs gap-1',
  lg: 'px-2.5 py-1 text-sm gap-1.5',
}

export function TaskPriorityBadge({ priority, size = 'md', showLabel = true }: TaskPriorityBadgeProps) {
  const config = priorityConfig[priority]
  const sizeClasses = sizeConfig[size]

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${config.bgColor} ${config.color} ${sizeClasses}`}
      title={config.label}
    >
      {config.icon}
      {showLabel && config.label}
    </span>
  )
}
