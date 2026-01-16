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

  // Actions
  initialize: () => Promise<void>
  signUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: true,
  error: null,
  initialized: false,

  initialize: async () => {
    if (get().initialized) return

    if (!supabase) {
      set({ loading: false, initialized: true })
      return
    }

    try {
      const session = await authService.getSession()
      set({
        user: session?.user ?? null,
        session,
        loading: false,
        initialized: true,
      })

      // Listen for auth changes
      supabase.auth.onAuthStateChange((_event, session) => {
        set({
          user: session?.user ?? null,
          session,
        })
      })
    } catch (error) {
      set({
        loading: false,
        initialized: true,
        error: error instanceof Error ? error.message : 'Failed to initialize auth',
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

  clearError: () => set({ error: null }),
}))
