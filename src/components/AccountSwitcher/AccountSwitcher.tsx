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
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 transition-colors ${
          compact ? 'min-w-0' : 'min-w-[180px]'
        }`}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
        ) : current ? (
          <>
            <span className="text-cyan-400">
              {accountTypeIcons[current.type || 'internal']}
            </span>
            {!compact && (
              <span className="flex-1 text-left text-sm font-medium text-white truncate">
                {current.name}
              </span>
            )}
          </>
        ) : (
          <span className="text-gray-400 text-sm">Select account</span>
        )}
        <ChevronDown
          className={`w-4 h-4 text-gray-400 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
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
            className="absolute top-full left-0 mt-2 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden"
            style={{ zIndex: 400 }}
          >
            {/* Account groups */}
            <div className="py-2 max-h-80 overflow-y-auto">
              {(['internal', 'personal', 'client'] as AccountType[]).map((type) => {
                const accountsOfType = groupedAccounts[type]
                if (!accountsOfType || accountsOfType.length === 0) return null

                return (
                  <div key={type}>
                    {/* Group header */}
                    <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {accountTypeLabels[type]}
                    </div>

                    {/* Accounts in group */}
                    {accountsOfType.map((account) => (
                      <button
                        key={account.id}
                        onClick={() => handleSelectAccount(account.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-700 transition-colors ${
                          account.id === currentAccountId
                            ? 'bg-gray-700/50'
                            : ''
                        }`}
                      >
                        <span className="text-cyan-400">
                          {accountTypeIcons[account.type || 'internal']}
                        </span>
                        <span className="flex-1 text-left text-sm text-white">
                          {account.name}
                        </span>
                        {account.id === currentAccountId && (
                          <Check className="w-4 h-4 text-cyan-400" />
                        )}
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>

            {/* Divider */}
            <div className="border-t border-gray-700" />

            {/* Actions */}
            <div className="py-2">
              <button
                onClick={() => {
                  setIsOpen(false)
                  setShowAddModal(true)
                }}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-700 transition-colors text-gray-300"
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
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-700 transition-colors text-gray-300"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
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
        className="relative w-full max-w-md mx-4 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl"
      >
        <div className="p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Add Account</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name input */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Account Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Acme Corp"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>

            {/* Type selector */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Account Type
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['internal', 'personal', 'client'] as AccountType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-colors ${
                      type === t
                        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                        : 'border-gray-600 hover:border-gray-500 text-gray-300'
                    }`}
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
                className="flex-1 px-4 py-2 border border-gray-600 rounded-lg text-gray-300 hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
