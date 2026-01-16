import { useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { motion, AnimatePresence } from 'framer-motion'
import { User, LogOut, Loader2 } from 'lucide-react'

export function UserMenu() {
  const { user, signOut, loading } = useAuthStore()
  const [menuOpen, setMenuOpen] = useState(false)

  if (!user) return null

  const handleSignOut = async () => {
    try {
      await signOut()
      setMenuOpen(false)
    } catch {
      // Error handled in store
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        title={user.email || 'Account'}
        className="p-2 rounded-lg transition-colors hover:bg-[var(--fl-color-bg-elevated)]"
        style={{ color: 'var(--fl-color-text-secondary)' }}
      >
        <User size={18} />
      </button>

      <AnimatePresence>
        {menuOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0"
              style={{ zIndex: 'var(--fl-z-dropdown)' }}
              onClick={() => setMenuOpen(false)}
            />

            {/* Dropdown Menu */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 rounded-lg shadow-lg min-w-[220px]"
              style={{
                top: '48px',
                zIndex: 'calc(var(--fl-z-dropdown) + 1)',
                background: 'var(--fl-color-bg-surface)',
                border: '1px solid var(--fl-color-border)',
                padding: 'var(--fl-spacing-xs) 0'
              }}
            >
              {/* User Info */}
              <div
                style={{
                  padding: 'var(--fl-spacing-sm) var(--fl-spacing-md)',
                  borderBottom: '1px solid var(--fl-color-border)'
                }}
              >
                <p
                  className="text-sm font-medium truncate"
                  style={{ color: 'var(--fl-color-text-primary)' }}
                >
                  {user.email}
                </p>
                <p
                  className="text-xs"
                  style={{ color: 'var(--fl-color-text-muted)', marginTop: '2px' }}
                >
                  Signed in
                </p>
              </div>

              {/* Menu Items */}
              <div style={{ padding: 'var(--fl-spacing-xs) 0' }}>
                <button
                  onClick={handleSignOut}
                  disabled={loading}
                  className="w-full flex items-center gap-3 text-sm disabled:opacity-50"
                  style={{
                    padding: 'var(--fl-spacing-sm) var(--fl-spacing-md)',
                    color: 'var(--fl-color-text-secondary)',
                    transition: 'var(--fl-transition-fast)'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--fl-color-bg-elevated)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  {loading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <LogOut size={16} />
                  )}
                  Sign out
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
