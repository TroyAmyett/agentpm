import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown,
  Building2,
  User,
  Briefcase,
  Plus,
  Check,
  Settings,
  Loader2,
} from 'lucide-react'
import { useAccountStore } from '@/stores/accountStore'
import type { AccountType, AccountWithConfig } from '@/types/agentpm'

interface AccountSwitcherProps {
  className?: string
  compact?: boolean
}

const accountTypeIcons: Record<AccountType, React.ReactNode> = {
  internal: <Building2 className="w-4 h-4" />,
  personal: <User className="w-4 h-4" />,
  client: <Briefcase className="w-4 h-4" />,
}

const accountTypeLabels: Record<AccountType, string> = {
  internal: 'Internal',
  personal: 'Personal',
  client: 'Client',
}

export function AccountSwitcher({ className = '', compact = false }: AccountSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const {
    accounts,
    currentAccountId,
    isLoading,
    selectAccount,
    currentAccount,
    fetchAccounts,
  } = useAccountStore()

  const current = currentAccount()

  // Fetch accounts on mount
  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Group accounts by type
  const groupedAccounts = accounts.reduce<Record<AccountType, AccountWithConfig[]>>(
    (groups, account) => {
      const type = account.type || 'internal'
      if (!groups[type]) {
        groups[type] = []
      }
      groups[type].push(account)
      return groups
    },
    {} as Record<AccountType, AccountWithConfig[]>
  )

  const handleSelectAccount = (accountId: string) => {
    selectAccount(accountId)
    setIsOpen(false)
  }

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
          compact ? 'min-w-0' : 'min-w-[200px]'
        }`}
        style={{
          border: '1px solid var(--fl-color-border)',
          background: 'var(--fl-color-bg-surface)',
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--fl-color-bg-elevated)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'var(--fl-color-bg-surface)'}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--fl-color-text-muted)' }} />
        ) : current ? (
          <>
            <span className="text-sm" style={{ color: 'var(--fl-color-text-muted)' }}>Account:</span>
            <span style={{ color: 'var(--fl-color-primary)' }}>
              {accountTypeIcons[current.type || 'internal']}
            </span>
            {!compact && (
              <span className="flex-1 text-left text-sm font-medium truncate" style={{ color: 'var(--fl-color-text-primary)' }}>
                {current.name}
              </span>
            )}
          </>
        ) : (
          <span className="text-sm" style={{ color: 'var(--fl-color-text-muted)' }}>Select account</span>
        )}
        <ChevronDown
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          style={{ color: 'var(--fl-color-text-muted)' }}
        />
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 mt-2 w-64 rounded-lg shadow-xl overflow-hidden"
            style={{
              zIndex: 9999,
              background: 'var(--fl-color-bg-surface)',
              border: '1px solid var(--fl-color-border)',
            }}
          >
            {/* Account groups */}
            <div className="py-2 max-h-80 overflow-y-auto">
              {(['internal', 'personal', 'client'] as AccountType[]).map((type) => {
                const accountsOfType = groupedAccounts[type]
                if (!accountsOfType || accountsOfType.length === 0) return null

                return (
                  <div key={type}>
                    {/* Group header */}
                    <div
                      className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--fl-color-text-muted)' }}
                    >
                      {accountTypeLabels[type]}
                    </div>

                    {/* Accounts in group */}
                    {accountsOfType.map((account) => (
                      <button
                        key={account.id}
                        onClick={() => handleSelectAccount(account.id)}
                        className="w-full flex items-center gap-3 px-3 py-2 transition-colors"
                        style={{
                          background: account.id === currentAccountId ? 'var(--fl-color-bg-elevated)' : 'transparent',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--fl-color-bg-elevated)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = account.id === currentAccountId ? 'var(--fl-color-bg-elevated)' : 'transparent'}
                      >
                        <span style={{ color: 'var(--fl-color-primary)' }}>
                          {accountTypeIcons[account.type || 'internal']}
                        </span>
                        <span className="flex-1 text-left text-sm" style={{ color: 'var(--fl-color-text-primary)' }}>
                          {account.name}
                        </span>
                        {account.id === currentAccountId && (
                          <Check className="w-4 h-4" style={{ color: 'var(--fl-color-primary)' }} />
                        )}
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>

            {/* Divider */}
            <div style={{ borderTop: '1px solid var(--fl-color-border)' }} />

            {/* Actions */}
            <div className="py-2">
              <button
                onClick={() => {
                  setIsOpen(false)
                  setShowAddModal(true)
                }}
                className="w-full flex items-center gap-3 px-3 py-2 transition-colors"
                style={{ color: 'var(--fl-color-text-secondary)' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--fl-color-bg-elevated)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <Plus className="w-4 h-4" />
                <span className="text-sm">Add Account</span>
              </button>

              {current && (
                <button
                  onClick={() => {
                    setIsOpen(false)
                    // TODO: Open account settings
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 transition-colors"
                  style={{ color: 'var(--fl-color-text-secondary)' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--fl-color-bg-elevated)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <Settings className="w-4 h-4" />
                  <span className="text-sm">Account Settings</span>
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Account Modal */}
      <AddAccountModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
      />
    </div>
  )
}

// Add Account Modal Component
interface AddAccountModalProps {
  isOpen: boolean
  onClose: () => void
}

function AddAccountModal({ isOpen, onClose }: AddAccountModalProps) {
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('client')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { createAccount } = useAccountStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      setError('Account name is required')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      await createAccount({
        name: name.trim(),
        slug: name.trim().toLowerCase().replace(/\s+/g, '-'),
        type,
        status: 'active',
        config: {},
      })
      setName('')
      setType('client')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 10000 }}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-md mx-4 rounded-xl shadow-2xl"
        style={{
          background: 'var(--fl-color-bg-surface)',
          border: '1px solid var(--fl-color-border)',
        }}
      >
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--fl-color-text-primary)' }}>Add Account</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name input */}
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--fl-color-text-secondary)' }}>
                Account Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Acme Corp"
                className="w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2"
                style={{
                  background: 'var(--fl-color-bg-elevated)',
                  border: '1px solid var(--fl-color-border)',
                  color: 'var(--fl-color-text-primary)',
                }}
              />
            </div>

            {/* Type selector */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--fl-color-text-secondary)' }}>
                Account Type
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['internal', 'personal', 'client'] as AccountType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className="flex flex-col items-center gap-1 p-3 rounded-lg border transition-colors"
                    style={{
                      borderColor: type === t ? 'var(--fl-color-primary)' : 'var(--fl-color-border)',
                      background: type === t ? 'rgba(14, 165, 233, 0.1)' : 'transparent',
                      color: type === t ? 'var(--fl-color-primary)' : 'var(--fl-color-text-secondary)',
                    }}
                  >
                    {accountTypeIcons[t]}
                    <span className="text-xs">{accountTypeLabels[t]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Error message */}
            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 rounded-lg transition-colors"
                style={{
                  border: '1px solid var(--fl-color-border)',
                  color: 'var(--fl-color-text-secondary)',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{
                  background: 'var(--fl-color-primary)',
                  color: 'white',
                }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Account'
                )}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  )
}

export default AccountSwitcher
