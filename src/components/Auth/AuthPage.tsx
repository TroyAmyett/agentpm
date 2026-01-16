import { useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { motion } from 'framer-motion'
import { Input } from '@funnelists/ui'
import { Mail, Lock, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react'

type AuthMode = 'signin' | 'signup' | 'reset'

export function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const { signIn, signUp, resetPassword, loading, error, clearError } = useAuthStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    setSuccessMessage(null)

    try {
      if (mode === 'signin') {
        await signIn(email, password)
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
        padding: 'var(--fl-spacing-md)'
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
          <div className="text-center" style={{ marginBottom: 'var(--fl-spacing-xl)' }}>
            <div
              className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--fl-color-primary)', marginBottom: 'var(--fl-spacing-md)' }}
            >
              <span className="text-2xl text-white font-bold">N</span>
            </div>
            <h1
              className="text-2xl font-bold"
              style={{ color: 'var(--fl-color-text-primary)' }}
            >
              {mode === 'signin' && 'Welcome Back'}
              {mode === 'signup' && 'Create Account'}
              {mode === 'reset' && 'Reset Password'}
            </h1>
            <p style={{ color: 'var(--fl-color-text-secondary)', marginTop: 'var(--fl-spacing-sm)' }}>
              {mode === 'signin' && 'Sign in to sync your notes across devices'}
              {mode === 'signup' && 'Start taking smarter notes today'}
              {mode === 'reset' && "We'll send you a reset link"}
            </p>
          </div>

          {/* Success Message */}
          {successMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 p-3 mb-6 bg-green-50 dark:bg-green-900/20 rounded-lg text-green-600 dark:text-green-400"
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
              className="flex items-center gap-2 p-3 mb-6 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-600 dark:text-red-400"
            >
              <AlertCircle size={18} />
              <p className="text-sm">{error}</p>
            </motion.div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Input */}
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              required
              leftElement={<Mail size={18} />}
            />

            {/* Password Input */}
            {mode !== 'reset' && (
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                leftElement={<Lock size={18} />}
                error={mode === 'signup' && password.length > 0 && !passwordValid ? 'Password must be at least 6 characters' : undefined}
              />
            )}

            {/* Confirm Password (Sign Up only) */}
            {mode === 'signup' && (
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                required
                leftElement={<Lock size={18} />}
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
          <div className="text-center" style={{ marginTop: 'var(--fl-spacing-lg)' }}>
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
          style={{ color: 'var(--fl-color-text-muted)', marginTop: 'var(--fl-spacing-lg)' }}
        >
          NoteTaker - Your intelligent note-taking companion
        </p>
      </motion.div>
    </div>
  )
}
