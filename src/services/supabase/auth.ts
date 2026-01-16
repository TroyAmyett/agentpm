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

  const { data: { session } } = await supabase.auth.getSession()
  return session
}
