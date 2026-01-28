// Changelog Badge
// Bell icon with unread count badge

import { useEffect } from 'react'
import { Bell } from 'lucide-react'
import { useChangelogStore } from '@/stores/changelogStore'
import { useAuthStore } from '@/stores/authStore'

export function ChangelogBadge() {
  const { user } = useAuthStore()
  const { unreadCount, fetchUnreadCount, fetchUnreadHighlights, openDrawer } = useChangelogStore()

  // Fetch unread count and highlights on mount
  useEffect(() => {
    if (user?.id) {
      fetchUnreadCount(user.id)
      fetchUnreadHighlights(user.id)
    }
  }, [user?.id, fetchUnreadCount, fetchUnreadHighlights])

  const handleClick = () => {
    openDrawer()
  }

  return (
    <button
      onClick={handleClick}
      title="What's New"
      className="relative p-2 rounded-lg transition-colors hover:bg-[var(--fl-color-bg-elevated)]"
      style={{ color: 'var(--fl-color-text-secondary)' }}
    >
      <Bell size={18} />
      {unreadCount > 0 && (
        <span
          className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-medium rounded-full"
          style={{
            background: '#ef4444',
            color: '#ffffff',
            padding: '0 4px',
          }}
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  )
}
