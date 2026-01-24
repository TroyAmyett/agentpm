import { useSyncStore } from '@/stores/syncStore'
import { CloudOff, Loader2, AlertCircle, Check } from 'lucide-react'

export function SyncStatusIndicator() {
  const { status, queue, lastSyncedAt, error } = useSyncStore()

  const statusConfig = {
    synced: {
      icon: Check,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
      label: 'Synced',
    },
    syncing: {
      icon: Loader2,
      color: 'text-primary-500',
      bgColor: 'bg-primary-500/10',
      label: 'Syncing',
    },
    offline: {
      icon: CloudOff,
      color: 'text-surface-400',
      bgColor: 'bg-surface-400/10',
      label: 'Offline',
    },
    error: {
      icon: AlertCircle,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
      label: 'Error',
    },
  }

  const config = statusConfig[status]
  const Icon = config.icon

  const formatLastSynced = () => {
    if (!lastSyncedAt) return null
    const date = new Date(lastSyncedAt)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    return date.toLocaleDateString()
  }

  const getTooltip = () => {
    if (status === 'error' && error) {
      return `Error: ${error}`
    }
    if (lastSyncedAt) {
      return `Last synced: ${formatLastSynced()}`
    }
    return undefined
  }

  return (
    <div className="flex items-center gap-2">
      <div
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${config.bgColor} cursor-default`}
        title={getTooltip()}
      >
        <Icon
          size={14}
          className={`${config.color} ${status === 'syncing' ? 'animate-spin' : ''}`}
        />
        <span className={`text-xs font-medium ${config.color}`}>
          {config.label}
        </span>
        {queue.length > 0 && status !== 'synced' && (
          <span className="text-xs text-surface-400">
            ({queue.length})
          </span>
        )}
      </div>
    </div>
  )
}
