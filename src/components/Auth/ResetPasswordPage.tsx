import { useState, useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { motion } from 'framer-motion'
import { Lock, AlertCircle, CheckCircle, Bot, Loader2 } from 'lucide-react'

function InputField({
  type,
  value,
  onChange,
  placeholder,
  required,
  leftIcon,
  error
}: {
  type: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  required?: boolean
  leftIcon?: React.ReactNode
  error?: string
}) {
  return (
    <div>
      <div
        className="flex items-center gap-3 rounded-lg"
        style={{
          background: 'var(--fl-color-bg-base)',
          border: error ? '1px solid var(--fl-color-error)' : '1px solid var(--fl-color-border)',
          padding: '12px 16px'
        }}
      >
        {leftIcon && <span style={{ color: 'var(--fl-color-text-muted)' }}>{leftIcon}</span>}
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          className="flex-1 bg-transparent outline-none text-sm"
          style={{ color: 'var(--fl-color-text-primary)' }}
        />
      </div>
      {error && (
        <p className="text-xs mt-1" style={{ color: 'var(--fl-color-error)' }}>{error}</p>
      )}
    </div>
  )
}

export function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [success, setSuccess] = useState(false)
  const [waiting, setWaiting] = useState(true)

  const { isPasswordRecovery, updatePassword, loading, error, clearError, initialize, initialized } = useAuthStore()

  // Force dark mode (this page renders outside the normal App flow)
  useEffect(() => {
    document.documentElement.classList.add('dark')
    document.documentElement.classList.remove('light')
  }, [])

  // Initialize auth (processes recovery tokens from URL hash)
  useEffect(() => {
    initialize()
  }, [initialize])

  // Wait for recovery session to be detected
  useEffect(() => {
    if (isPasswordRecovery) {
      setWaiting(false)
      return
    }

    // Give Supabase time to process the URL hash tokens
    const timeout = setTimeout(() => {
      setWaiting(false)
    }, 5000)

    return () => clearTimeout(timeout)
  }, [isPasswordRecovery])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()

    if (password !== confirmPassword) return
    if (password.length < 6) return

    try {
      await updatePassword(password)
      setSuccess(true)
      // Redirect to main app after success
      setTimeout(() => {
        window.location.href = '/'
      }, 2000)
    } catch {
      // Error handled in store
    }
  }

  const passwordsMatch = password === confirmPassword
  const passwordValid = password.length >= 6

  // Show loading while initializing
  if (!initialized || waiting) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--fl-color-bg-base)', padding: '16px' }}>
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={32} className="animate-spin" style={{ color: 'var(--fl-color-primary)' }} />
          <p style={{ color: 'var(--fl-color-text-muted)' }}>Verifying reset link...</p>
        </div>
      </div>
    )
  }

  // No recovery session detected
  if (!isPasswordRecovery && !success) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--fl-color-bg-base)', padding: '16px' }}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <div className="rounded-2xl shadow-xl" style={{ background: 'var(--fl-color-bg-surface)', padding: '32px', border: '1px solid var(--fl-color-border)' }}>
            <div className="text-center" style={{ marginBottom: '32px' }}>
              <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0ea5e9, #14b8a6)', marginBottom: '16px' }}>
                <Bot size={32} className="text-white" />
              </div>
              <h1 className="text-2xl font-bold" style={{ color: 'var(--fl-color-text-primary)' }}>Invalid or Expired Link</h1>
              <p style={{ color: 'var(--fl-color-text-secondary)', marginTop: '8px' }}>
                This password reset link is invalid or has expired. Please request a new one.
              </p>
            </div>
            <button
              onClick={() => { window.location.href = '/' }}
              className="w-full py-3 px-4 rounded-lg font-medium transition-all hover:opacity-90"
              style={{ background: 'var(--fl-color-primary)', color: 'white', border: '1px solid var(--fl-color-primary)' }}
            >
              Back to Sign In
            </button>
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--fl-color-bg-base)', padding: '16px' }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="rounded-2xl shadow-xl" style={{ background: 'var(--fl-color-bg-surface)', padding: '32px', border: '1px solid var(--fl-color-border)' }}>
          {/* Header */}
          <div className="text-center" style={{ marginBottom: '32px' }}>
            <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0ea5e9, #14b8a6)', marginBottom: '16px' }}>
              <Bot size={32} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--fl-color-text-primary)' }}>
              {success ? 'Password Updated' : 'Set New Password'}
            </h1>
            <p style={{ color: 'var(--fl-color-text-secondary)', marginTop: '8px' }}>
              {success ? 'Your password has been updated. Redirecting...' : 'Enter your new password below'}
            </p>
          </div>

          {/* Success Message */}
          {success && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 p-3 mb-6 rounded-lg"
              style={{ background: 'rgba(34, 197, 94, 0.1)', color: 'var(--fl-color-success)' }}
            >
              <CheckCircle size={18} />
              <p className="text-sm">Password updated successfully! Redirecting...</p>
            </motion.div>
          )}

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 p-3 mb-6 rounded-lg"
              style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--fl-color-error)' }}
            >
              <AlertCircle size={18} />
              <p className="text-sm">{error}</p>
            </motion.div>
          )}

          {/* Form */}
          {!success && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <InputField
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="New password"
                required
                leftIcon={<Lock size={18} />}
                error={password.length > 0 && !passwordValid ? 'Password must be at least 6 characters' : undefined}
              />

              <InputField
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                required
                leftIcon={<Lock size={18} />}
                error={confirmPassword && !passwordsMatch ? 'Passwords do not match' : undefined}
              />

              <button
                type="submit"
                disabled={loading || !passwordsMatch || !passwordValid}
                className="w-full py-3 px-4 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
                style={{ background: 'var(--fl-color-primary)', color: 'white', marginTop: '16px', border: '1px solid var(--fl-color-primary)' }}
              >
                {loading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-sm" style={{ color: 'var(--fl-color-text-muted)', marginTop: '24px' }}>
          AgentPM - AI-powered project management
        </p>
      </motion.div>
    </div>
  )
}
