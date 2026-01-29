import { supabase } from './client'

export interface SignUpCredentials {
  email: string
  password: string
}

export interface SignInCredentials {
  email: string
  password: string
}

export async function signUp({ email, password }: SignUpCredentials) {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  })

  if (error) throw error
  return data
}

export async function signIn({ email, password }: SignInCredentials) {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) throw error
  return data
}

export async function signOut() {
  if (!supabase) throw new Error('Supabase not configured')

  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function resetPassword(email: string) {
  if (!supabase) throw new Error('Supabase not configured')

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  })

  if (error) throw error
}

export async function updatePassword(newPassword: string) {
  if (!supabase) throw new Error('Supabase not configured')

  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  })

  if (error) throw error
}

export async function getSession() {
  if (!supabase) return null

  const { data: { session }, error } = await supabase.auth.getSession()

  if (error) {
    // Invalid refresh token or expired session — clear it so the app
    // shows the login page instead of hanging on "Loading..."
    console.warn('Session retrieval failed, signing out:', error.message)
    await supabase.auth.signOut().catch(() => {})
    return null
  }

  return session
}
