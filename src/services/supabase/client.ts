import { createClient, AuthError } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not found. Running in demo mode with local storage.')
}

// Create Supabase client with shared auth storage key
// All Funnelists apps must use the same storageKey for session sharing
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storageKey: 'funnelists-auth', // Shared across all Funnelists apps
      },
    })
  : null

export const isSupabaseConfigured = () => !!supabase

// JWT expiration error codes from PostgREST
const AUTH_ERROR_CODES = ['PGRST301', 'PGRST302', 'PGRST303']

/**
 * Check if an error is an authentication/JWT error
 */
export function isAuthError(error: unknown): boolean {
  if (!error) return false

  // Check for Supabase AuthError
  if (error instanceof AuthError) return true

  // Check for PostgREST JWT errors
  if (typeof error === 'object' && error !== null) {
    const err = error as { code?: string; message?: string; status?: number }
    if (err.code && AUTH_ERROR_CODES.includes(err.code)) return true
    if (err.message?.toLowerCase().includes('jwt expired')) return true
    if (err.message?.toLowerCase().includes('jwt')) return true
    if (err.status === 401 || err.status === 403) return true
  }

  return false
}

/**
 * Handle auth errors by signing out the user
 * Call this when you catch an auth error in your API calls
 */
export async function handleAuthError(): Promise<void> {
  if (!supabase) return

  console.warn('Session expired. Signing out...')

  // Clear the session
  await supabase.auth.signOut()

  // Reload the page to reset app state and show login
  window.location.reload()
}
