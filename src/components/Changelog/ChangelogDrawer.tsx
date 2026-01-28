// Changelog Drawer
// Slide-out panel showing changelog entries

import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, CheckCheck, Loader2 } from 'lucide-react'
import { useChangelogStore } from '@/stores/changelogStore'
import { useAuthStore } from '@/stores/authStore'
import { ChangelogEntry } from './ChangelogEntry'

export function ChangelogDrawer() {
  const { user } = useAuthStore()
  const {
    entries,
    isLoading,
    isDrawerOpen,
    closeDrawer,
    fetchEntries,
    markAllAsRead,
    markAsRead,
  } = useChangelogStore()
  const drawerRef = useRef<HTMLDivElement>(null)

  // Fetch entries when drawer opens
  useEffect(() => {
    if (isDrawerOpen && user?.id) {
      fetchEntries(user.id)
    }
  }, [isDrawerOpen, user?.id, fetchEntries])

  // Mark visible entries as read after a short delay
  useEffect(() => {
    if (isDrawerOpen && user?.id && entries.length > 0) {
      const unreadIds = entries.filter((e) => !e.isRead).map((e) => e.id)
      if (unreadIds.length > 0) {
        const timer = setTimeout(() => {
          markAsRead(user.id, unreadIds)
        }, 2000)
        return () => clearTimeout(timer)
      }
    }
  }, [isDrawerOpen, user?.id, entries, markAsRead])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDrawerOpen) {
        closeDrawer()
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isDrawerOpen, closeDrawer])

  const handleMarkAllRead = () => {
    if (user?.id) {
      markAllAsRead(user.id)
    }
  }

  const unreadCount = entries.filter((e) => !e.isRead).length

  return (
    <AnimatePresence>
      {isDrawerOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0"
            style={{
              background: 'rgba(0, 0, 0, 0.5)',
              zIndex: 'var(--fl-z-modal)',
            }}
            onClick={closeDrawer}
          />

          {/* Drawer */}
          <motion.div
            ref={drawerRef}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed top-0 right-0 h-full w-full max-w-md flex flex-col"
            style={{
              background: 'var(--fl-color-bg-surface)',
              borderLeft: '1px solid var(--fl-color-border)',
              zIndex: 'calc(var(--fl-z-modal) + 1)',
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3 flex-shrink-0"
              style={{ borderBottom: '1px solid var(--fl-color-border)' }}
            >
              <h2
                className="text-lg font-medium"
                style={{ color: 'var(--fl-color-text-primary)' }}
              >
                What's New
              </h2>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--fl-color-bg-elevated)]"
                    style={{ color: 'var(--fl-color-text-secondary)' }}
                  >
                    <CheckCheck size={14} />
                    Mark all read
                  </button>
                )}
                <button
                  onClick={closeDrawer}
                  className="p-2 rounded-lg transition-colors hover:bg-[var(--fl-color-bg-elevated)]"
                  style={{ color: 'var(--fl-color-text-secondary)' }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2
                    size={24}
                    className="animate-spin"
                    style={{ color: 'var(--fl-color-text-muted)' }}
                  />
                </div>
              ) : entries.length === 0 ? (
                <div className="text-center py-12">
                  <p
                    className="text-sm"
                    style={{ color: 'var(--fl-color-text-muted)' }}
                  >
                    No updates yet. Check back later!
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {entries.map((entry) => (
                    <ChangelogEntry key={entry.id} entry={entry} />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
