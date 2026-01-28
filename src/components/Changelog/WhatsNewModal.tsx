// What's New Modal
// Auto-popup modal for highlighted changelog entries

import { motion, AnimatePresence } from 'framer-motion'
import { X, Sparkles } from 'lucide-react'
import { useChangelogStore } from '@/stores/changelogStore'
import { useAuthStore } from '@/stores/authStore'

export function WhatsNewModal() {
  const { user } = useAuthStore()
  const { unreadHighlights, isWhatsNewOpen, closeWhatsNew, dismissHighlights, openDrawer } =
    useChangelogStore()

  const handleDismiss = () => {
    if (user?.id) {
      dismissHighlights(user.id)
    }
  }

  const handleViewAll = () => {
    closeWhatsNew()
    openDrawer()
  }

  if (unreadHighlights.length === 0) return null

  return (
    <AnimatePresence>
      {isWhatsNewOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0"
            style={{
              background: 'rgba(0, 0, 0, 0.6)',
              zIndex: 'var(--fl-z-modal)',
            }}
            onClick={handleDismiss}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg rounded-xl shadow-2xl"
            style={{
              background: 'var(--fl-color-bg-surface)',
              border: '1px solid var(--fl-color-border)',
              zIndex: 'calc(var(--fl-z-modal) + 1)',
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: '1px solid var(--fl-color-border)' }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="p-2 rounded-lg"
                  style={{ background: 'rgba(245, 158, 11, 0.15)' }}
                >
                  <Sparkles size={20} style={{ color: '#f59e0b' }} />
                </div>
                <div>
                  <h2
                    className="text-lg font-semibold"
                    style={{ color: 'var(--fl-color-text-primary)' }}
                  >
                    What's New
                  </h2>
                  <p
                    className="text-sm"
                    style={{ color: 'var(--fl-color-text-muted)' }}
                  >
                    {unreadHighlights.length} new update{unreadHighlights.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={handleDismiss}
                className="p-2 rounded-lg transition-colors hover:bg-[var(--fl-color-bg-elevated)]"
                style={{ color: 'var(--fl-color-text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
              <div className="space-y-4">
                {unreadHighlights.map((highlight) => (
                  <div
                    key={highlight.id}
                    className="p-4 rounded-lg"
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid var(--fl-color-border)',
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{
                          background: 'rgba(34, 197, 94, 0.2)',
                          color: '#22c55e',
                        }}
                      >
                        {highlight.commitType === 'feat' ? 'New Feature' : 'Update'}
                      </span>
                      <span
                        className="text-xs"
                        style={{ color: 'var(--fl-color-text-muted)' }}
                      >
                        {new Date(highlight.commitDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                    <h3
                      className="text-base font-medium mb-1"
                      style={{ color: 'var(--fl-color-text-primary)' }}
                    >
                      {highlight.title}
                    </h3>
                    {highlight.description && (
                      <p
                        className="text-sm"
                        style={{ color: 'var(--fl-color-text-secondary)' }}
                      >
                        {highlight.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div
              className="flex items-center justify-between px-6 py-4"
              style={{ borderTop: '1px solid var(--fl-color-border)' }}
            >
              <button
                onClick={handleViewAll}
                className="text-sm font-medium transition-colors"
                style={{ color: '#0ea5e9' }}
              >
                View all updates
              </button>
              <button
                onClick={handleDismiss}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: '#0ea5e9',
                  color: '#ffffff',
                }}
              >
                Got it
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
