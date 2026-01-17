// Accept Invitation Page
// Allows users to accept account invitations

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle, XCircle, Loader2, Building2, Mail, AlertCircle } from 'lucide-react'
import { acceptInvitation } from '@/services/identity/members'
import { fetchAccount } from '@/services/identity/accounts'
import { useAuthStore } from '@/stores/authStore'
import type { AccountWithConfig } from '@/types/agentpm'

interface AcceptInvitationProps {
  token: string
  onSuccess?: (accountId: string) => void
  onError?: (error: string) => void
}

export function AcceptInvitation({ token, onSuccess, onError }: AcceptInvitationProps) {
  const { user } = useAuthStore()
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'not-authenticated'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [account, setAccount] = useState<AccountWithConfig | null>(null)

  useEffect(() => {
    if (!user) {
      setStatus('not-authenticated')
      return
    }

    handleAcceptInvitation()
  }, [token, user])

  const handleAcceptInvitation = async () => {
    try {
      setStatus('loading')
      const result = await acceptInvitation(token)

      // Fetch account details
      const accountData = await fetchAccount(result.accountId)
      setAccount(accountData)

      setStatus('success')
      onSuccess?.(result.accountId)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to accept invitation'
      setError(message)
      setStatus('error')
      onError?.(message)
    }
  }

  if (status === 'not-authenticated') {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ background: 'var(--fl-color-bg-base)' }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full p-8 rounded-2xl text-center"
          style={{
            background: 'var(--fl-color-bg-surface)',
            border: '1px solid var(--fl-color-border)',
          }}
        >
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: 'rgba(234, 179, 8, 0.2)' }}
          >
            <AlertCircle size={32} className="text-yellow-500" />
          </div>
          <h1 className="text-xl font-semibold mb-2" style={{ color: 'var(--fl-color-text-primary)' }}>
            Sign In Required
          </h1>
          <p className="text-sm mb-6" style={{ color: 'var(--fl-color-text-muted)' }}>
            Please sign in to accept this invitation. The invitation will be processed after you sign in.
          </p>
          <a
            href={`/auth?redirect=/accept-invite?token=${token}`}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-white"
            style={{ background: 'var(--fl-color-primary)' }}
          >
            <Mail size={18} />
            Sign In
          </a>
        </motion.div>
      </div>
    )
  }

  if (status === 'loading') {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ background: 'var(--fl-color-bg-base)' }}
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <Loader2 size={48} className="animate-spin mx-auto mb-4 text-cyan-400" />
          <p style={{ color: 'var(--fl-color-text-muted)' }}>
            Accepting invitation...
          </p>
        </motion.div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ background: 'var(--fl-color-bg-base)' }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full p-8 rounded-2xl text-center"
          style={{
            background: 'var(--fl-color-bg-surface)',
            border: '1px solid var(--fl-color-border)',
          }}
        >
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: 'rgba(239, 68, 68, 0.2)' }}
          >
            <XCircle size={32} className="text-red-500" />
          </div>
          <h1 className="text-xl font-semibold mb-2" style={{ color: 'var(--fl-color-text-primary)' }}>
            Invitation Failed
          </h1>
          <p className="text-sm mb-6" style={{ color: 'var(--fl-color-text-muted)' }}>
            {error || 'The invitation could not be processed.'}
          </p>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              color: 'var(--fl-color-text-primary)',
              border: '1px solid var(--fl-color-border)',
            }}
          >
            Go to Dashboard
          </a>
        </motion.div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'var(--fl-color-bg-base)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full p-8 rounded-2xl text-center"
        style={{
          background: 'var(--fl-color-bg-surface)',
          border: '1px solid var(--fl-color-border)',
        }}
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', delay: 0.2 }}
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ background: 'rgba(34, 197, 94, 0.2)' }}
        >
          <CheckCircle size={32} className="text-green-500" />
        </motion.div>

        <h1 className="text-xl font-semibold mb-2" style={{ color: 'var(--fl-color-text-primary)' }}>
          Welcome to the Team!
        </h1>

        <p className="text-sm mb-6" style={{ color: 'var(--fl-color-text-muted)' }}>
          You have successfully joined{' '}
          <span className="font-medium text-cyan-400">{account?.name || 'the account'}</span>
        </p>

        {account && (
          <div
            className="flex items-center gap-3 p-4 rounded-lg mb-6"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--fl-color-border)',
            }}
          >
            <div
              className="w-12 h-12 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(14, 165, 233, 0.2)' }}
            >
              <Building2 size={24} className="text-cyan-400" />
            </div>
            <div className="text-left">
              <div className="font-medium" style={{ color: 'var(--fl-color-text-primary)' }}>
                {account.name}
              </div>
              <div className="text-xs capitalize" style={{ color: 'var(--fl-color-text-muted)' }}>
                {account.type} Account
              </div>
            </div>
          </div>
        )}

        <a
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-white"
          style={{ background: 'var(--fl-color-primary)' }}
        >
          Go to Dashboard
        </a>
      </motion.div>
    </div>
  )
}

export default AcceptInvitation
