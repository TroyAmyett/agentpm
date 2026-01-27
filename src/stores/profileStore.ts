// Profile Store
// Manages user profile settings (language, currency, timezone, etc.)

import { create } from 'zustand'
import { supabase } from '@/services/supabase/client'

export interface UserProfile {
  id: string
  userId: string
  fullName?: string
  displayName?: string
  avatarUrl?: string
  language: string
  currency: string
  timezone: string
  dateFormat: string
  timeFormat: string
  isSuperAdmin: boolean  // God mode: full access to all features across all apps
  createdAt: string
  updatedAt: string
}

interface ProfileState {
  profile: UserProfile | null
  isLoading: boolean
  error: string | null

  // Actions
  fetchProfile: (userId: string) => Promise<void>
  updateProfile: (updates: Partial<Pick<UserProfile, 'fullName' | 'displayName' | 'avatarUrl' | 'language' | 'currency' | 'timezone' | 'dateFormat' | 'timeFormat'>>) => Promise<void>
  clearError: () => void
}

// Default profile values
const DEFAULT_PROFILE: Omit<UserProfile, 'id' | 'userId' | 'createdAt' | 'updatedAt'> = {
  language: 'en',
  currency: 'USD',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  dateFormat: 'MM/DD/YYYY',
  timeFormat: '12h',
  isSuperAdmin: false,
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  isLoading: false,
  error: null,

  fetchProfile: async (userId: string) => {
    if (!supabase) {
      // No Supabase = use defaults
      set({
        profile: {
          id: 'local',
          userId,
          ...DEFAULT_PROFILE,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        isLoading: false,
        error: null,
      })
      return
    }

    set({ isLoading: true, error: null })

    try {
      // Try to get existing profile
      console.log('[ProfileStore] Fetching profile for user:', userId)
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', userId)
        .single()

      console.log('[ProfileStore] Fetch result:', { data, error })

      if (error) {
        // Handle auth errors gracefully
        const authErrors = ['JWT expired', 'invalid claim', 'session', 'token', 'unauthorized']
        const isAuthError = authErrors.some(e =>
          error.message?.toLowerCase().includes(e.toLowerCase())
        )

        if (isAuthError) {
          const { error: refreshError } = await supabase.auth.refreshSession()
          if (refreshError) {
            console.warn('Session expired, using default profile')
            set({
              profile: {
                id: 'local',
                userId,
                ...DEFAULT_PROFILE,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              isLoading: false,
              error: null,
            })
            return
          }
          // Retry after refresh
          const { data: retryData, error: retryError } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('user_id', userId)
            .single()

          if (retryError && retryError.code !== 'PGRST116') {
            throw retryError
          }

          if (retryData) {
            set({
              profile: mapDbRowToProfile(retryData),
              isLoading: false,
            })
            return
          }
        }

        // Not found - create new profile
        if (error.code === 'PGRST116') {
          const { data: newProfile, error: insertError } = await supabase
            .from('user_profiles')
            .insert({
              id: userId,  // Legacy schema: id must equal user_id (FK to auth.users)
              user_id: userId,
              language: DEFAULT_PROFILE.language,
              currency: DEFAULT_PROFILE.currency,
              timezone: DEFAULT_PROFILE.timezone,
              date_format: DEFAULT_PROFILE.dateFormat,
              time_format: DEFAULT_PROFILE.timeFormat,
            })
            .select()
            .single()

          if (insertError) {
            // If insert fails, just use local defaults
            console.warn('Could not create profile, using defaults:', insertError.message, insertError.code, insertError.details)
            set({
              profile: {
                id: 'local',
                userId,
                ...DEFAULT_PROFILE,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              isLoading: false,
              error: null,
            })
            return
          }

          set({
            profile: mapDbRowToProfile(newProfile),
            isLoading: false,
          })
          return
        }

        throw error
      }

      set({
        profile: mapDbRowToProfile(data),
        isLoading: false,
      })
    } catch (err) {
      console.error('Failed to fetch profile:', err)
      // Fail gracefully with defaults
      set({
        profile: {
          id: 'local',
          userId,
          ...DEFAULT_PROFILE,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        isLoading: false,
        error: null,
      })
    }
  },

  updateProfile: async (updates) => {
    const { profile } = get()
    if (!profile) return

    if (!supabase || profile.id === 'local') {
      // Local mode - just update state
      set({
        profile: {
          ...profile,
          ...updates,
          updatedAt: new Date().toISOString(),
        },
      })
      return
    }

    set({ isLoading: true, error: null })

    try {
      const dbUpdates: Record<string, unknown> = {}
      if (updates.fullName !== undefined) dbUpdates.full_name = updates.fullName
      if (updates.displayName !== undefined) dbUpdates.display_name = updates.displayName
      if (updates.avatarUrl !== undefined) dbUpdates.avatar_url = updates.avatarUrl
      if (updates.language !== undefined) dbUpdates.language = updates.language
      if (updates.currency !== undefined) dbUpdates.currency = updates.currency
      if (updates.timezone !== undefined) dbUpdates.timezone = updates.timezone
      if (updates.dateFormat !== undefined) dbUpdates.date_format = updates.dateFormat
      if (updates.timeFormat !== undefined) dbUpdates.time_format = updates.timeFormat

      const { data, error } = await supabase
        .from('user_profiles')
        .update(dbUpdates)
        .eq('id', profile.id)
        .select()
        .single()

      if (error) throw error

      set({
        profile: mapDbRowToProfile(data),
        isLoading: false,
      })
    } catch (err) {
      set({
        error: (err as Error).message,
        isLoading: false,
      })
    }
  },

  clearError: () => set({ error: null }),
}))

// Helper to map database row to TypeScript interface
function mapDbRowToProfile(row: Record<string, unknown>): UserProfile {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    fullName: row.full_name as string | undefined,
    displayName: row.display_name as string | undefined,
    avatarUrl: row.avatar_url as string | undefined,
    language: (row.language as string) || 'en',
    currency: (row.currency as string) || 'USD',
    timezone: (row.timezone as string) || 'UTC',
    dateFormat: (row.date_format as string) || 'MM/DD/YYYY',
    timeFormat: (row.time_format as string) || '12h',
    isSuperAdmin: (row.is_super_admin as boolean) || false,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}
