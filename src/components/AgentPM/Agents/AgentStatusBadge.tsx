// Agent Status Badge - Visual indicator for agent health status

import type { HealthStatus } from '@/types/agentpm'

interface AgentStatusBadgeProps {
  status: HealthStatus
  paused?: boolean
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
}

const statusConfig: Record<HealthStatus, { color: string; bgColor: string; label: string }> = {
  healthy: {
    color: 'bg-green-500',
    bgColor: 'bg-green-500/10',
    label: 'Healthy',
  },
  degraded: {
    color: 'bg-yellow-500',
    bgColor: 'bg-yellow-500/10',
    label: 'Degraded',
  },
  failing: {
    color: 'bg-red-500',
    bgColor: 'bg-red-500/10',
    label: 'Failing',
  },
  stopped: {
    color: 'bg-surface-400',
    bgColor: 'bg-surface-400/10',
    label: 'Stopped',
  },
}

const sizeConfig = {
  sm: { dot: 'w-2 h-2', text: 'text-xs' },
  md: { dot: 'w-2.5 h-2.5', text: 'text-sm' },
  lg: { dot: 'w-3 h-3', text: 'text-base' },
}

export function AgentStatusBadge({
  status,
  paused,
  size = 'md',
  showLabel = false,
}: AgentStatusBadgeProps) {
  const displayStatus = paused ? 'stopped' : status
  const config = statusConfig[displayStatus]
  const sizeClasses = sizeConfig[size]

  if (showLabel) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full ${config.bgColor}`}
      >
        <span className={`${sizeClasses.dot} rounded-full ${config.color}`} />
        <span className={`${sizeClasses.text} font-medium text-surface-700 dark:text-surface-300`}>
          {paused ? 'Paused' : config.label}
        </span>
      </span>
    )
  }

  return (
    <span
      className={`inline-block ${sizeClasses.dot} rounded-full ${config.color}`}
      title={paused ? 'Paused' : config.label}
    />
  )
}
