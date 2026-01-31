import { create } from 'zustand'
import { supabase } from '@/services/supabase/client'
import * as authService from '@/services/supabase/auth'
import type { User, Session } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
  error: string | null
  initialized: boolean
  isPasswordRecovery: boolean

  // Actions
  initialize: () => Promise<void>
  signUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  updatePassword: (newPassword: string) => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: true,
  error: null,
  initialized: false,
  isPasswordRecovery: false,

  initialize: async () => {
    if (get().initialized) return

    if (!supabase) {
      set({ loading: false, initialized: true })
      return
    }

    // Always listen for auth changes (sign-in, sign-out, token refresh)
    supabase.auth.onAuthStateChange((event, session) => {
      set({
        user: session?.user ?? null,
        session,
        // Set recovery flag when Supabase detects a password recovery token
        isPasswordRecovery: event === 'PASSWORD_RECOVERY' ? true : get().isPasswordRecovery,
      })
    })

    try {
      const session = await authService.getSession()
      set({
        user: session?.user ?? null,
        session,
        loading: false,
        initialized: true,
      })
    } catch (error) {
      // Session expired or refresh token invalid — clear state so
      // the app shows the login page instead of hanging
      console.warn('Auth init failed, clearing session:', error)
      await supabase.auth.signOut().catch(() => {})
      set({
        user: null,
        session: null,
        loading: false,
        initialized: true,
        error: null,
      })
    }
  },

  signUp: async (email, password) => {
    set({ loading: true, error: null })
    try {
      const data = await authService.signUp({ email, password })
      // If email confirmation is required, user won't be set yet
      const needsConfirmation = !data.session
      set({ loading: false })
      return { needsConfirmation }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign up failed'
      set({ loading: false, error: message })
      throw err
    }
  },

  signIn: async (email, password) => {
    set({ loading: true, error: null })
    try {
      const { user, session } = await authService.signIn({ email, password })
      set({ user, session, loading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed'
      set({ loading: false, error: message })
      throw err
    }
  },

  signOut: async () => {
    set({ loading: true, error: null })
    try {
      await authService.signOut()
      set({ user: null, session: null, loading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign out failed'
      set({ loading: false, error: message })
      throw err
    }
  },

  resetPassword: async (email) => {
    set({ loading: true, error: null })
    try {
      await authService.resetPassword(email)
      set({ loading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Password reset failed'
      set({ loading: false, error: message })
      throw err
    }
  },

  updatePassword: async (newPassword) => {
    set({ loading: true, error: null })
    try {
      await authService.updatePassword(newPassword)
      set({ loading: false, isPasswordRecovery: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Password update failed'
      set({ loading: false, error: message })
      throw err
    }
  },

  clearError: () => set({ error: null }),
}))
