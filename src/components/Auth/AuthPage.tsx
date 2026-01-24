import { useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { motion } from 'framer-motion'
import { Mail, Lock, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react'

type AuthMode = 'signin' | 'signup' | 'reset'

// Inline Input component
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

export function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const { signIn, signUp, resetPassword, loading, error, clearError } = useAuthStore()

  // Get returnUrl from query params (for cross-app SSO)
  const returnUrl = new URLSearchParams(window.location.search).get('returnUrl')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    setSuccessMessage(null)

    try {
      if (mode === 'signin') {
        await signIn(email, password)
        // If there's a returnUrl (SSO from another Funnelists app), redirect back
        if (returnUrl) {
          window.location.href = returnUrl
          return
        }
      } else if (mode === 'signup') {
        if (password !== confirmPassword) {
          return
        }
        if (password.length < 6) {
          return
        }
        const result = await signUp(email, password)
        if (result.needsConfirmation) {
          setSuccessMessage('Check your email to confirm your account!')
          setMode('signin')
        }
      } else {
        await resetPassword(email)
        setSuccessMessage('Password reset email sent! Check your inbox.')
        setMode('signin')
      }
    } catch {
      // Error is handled in store
    }
  }

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode)
    clearError()
    setSuccessMessage(null)
    setPassword('')
    setConfirmPassword('')
  }

  const passwordsMatch = password === confirmPassword
  const passwordValid = password.length >= 6

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{
        background: 'var(--fl-color-bg-base)',
        padding: '16px'
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div
          className="rounded-2xl shadow-xl"
          style={{
            background: 'var(--fl-color-bg-surface)',
            padding: '32px',
            border: '1px solid var(--fl-color-border)'
          }}
        >
          {/* Header */}
          <div className="text-center" style={{ marginBottom: '32px' }}>
            <div
              className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #0ea5e9, #14b8a6)', marginBottom: '16px' }}
            >
              <span className="text-2xl text-white font-bold">F</span>
            </div>
            <h1
              className="text-2xl font-bold"
              style={{ color: 'var(--fl-color-text-primary)' }}
            >
              {mode === 'signin' && 'Welcome Back'}
              {mode === 'signup' && 'Create Account'}
              {mode === 'reset' && 'Reset Password'}
            </h1>
            <p style={{ color: 'var(--fl-color-text-secondary)', marginTop: '8px' }}>
              {mode === 'signin' && (returnUrl ? 'Sign in to continue to your app' : 'Sign in to access Funnelists')}
              {mode === 'signup' && 'Create your Funnelists account'}
              {mode === 'reset' && "We'll send you a reset link"}
            </p>
          </div>

          {/* Success Message */}
          {successMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 p-3 mb-6 rounded-lg"
              style={{ background: 'rgba(34, 197, 94, 0.1)', color: 'var(--fl-color-success)' }}
            >
              <CheckCircle size={18} />
              <p className="text-sm">{successMessage}</p>
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
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Input */}
            <InputField
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              required
              leftIcon={<Mail size={18} />}
            />

            {/* Password Input */}
            {mode !== 'reset' && (
              <InputField
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                leftIcon={<Lock size={18} />}
                error={mode === 'signup' && password.length > 0 && !passwordValid ? 'Password must be at least 6 characters' : undefined}
              />
            )}

            {/* Confirm Password (Sign Up only) */}
            {mode === 'signup' && (
              <InputField
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                required
                leftIcon={<Lock size={18} />}
                error={confirmPassword && !passwordsMatch ? 'Passwords do not match' : undefined}
              />
            )}

            {/* Forgot Password Link (Sign In only) */}
            {mode === 'signin' && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => switchMode('reset')}
                  className="text-sm hover:underline"
                  style={{ color: 'var(--fl-color-text-secondary)' }}
                >
                  Forgot password?
                </button>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || (mode === 'signup' && (!passwordsMatch || !passwordValid))}
              className="w-full py-3 px-4 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
              style={{
                background: 'var(--fl-color-primary)',
                color: 'white',
                marginTop: '16px',
                border: '1px solid var(--fl-color-primary)'
              }}
            >
              {loading ? 'Loading...' : mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'}
            </button>
          </form>

          {/* Mode Toggle */}
          <div className="text-center" style={{ marginTop: '24px' }}>
            {mode === 'reset' ? (
              <button
                onClick={() => switchMode('signin')}
                className="flex items-center justify-center gap-1 text-sm hover:underline mx-auto"
                style={{ color: 'var(--fl-color-primary)' }}
              >
                <ArrowLeft size={14} />
                Back to sign in
              </button>
            ) : (
              <p className="text-sm" style={{ color: 'var(--fl-color-text-secondary)' }}>
                {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
                <button
                  onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
                  className="hover:underline font-medium"
                  style={{ color: 'var(--fl-color-primary)' }}
                >
                  {mode === 'signin' ? 'Sign up' : 'Sign in'}
                </button>
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <p
          className="text-center text-sm"
          style={{ color: 'var(--fl-color-text-muted)', marginTop: '24px' }}
        >
          Funnelists - AI-powered business tools
        </p>
      </motion.div>
    </div>
  )
}
