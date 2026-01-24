// API Keys Store
// Manages user's encrypted API keys for LLM providers

import { create } from 'zustand'
import { supabase } from '@/services/supabase/client'
import {
  encryptApiKey,
  decryptApiKey,
  detectProvider,
  type Provider,
  type EncryptedKey,
} from '@/services/encryption'

export interface ApiKey {
  id: string
  userId: string
  accountId?: string
  provider: Provider
  providerName?: string
  keyHint: string
  isValid: boolean
  lastValidatedAt?: string
  lastUsedAt?: string
  usageCount: number
  scopes: string[]
  createdAt: string
  updatedAt: string
}

interface ApiKeysState {
  keys: ApiKey[]
  isLoading: boolean
  error: string | null

  // Actions
  fetchKeys: (userId: string) => Promise<void>
  addKey: (userId: string, apiKey: string, provider?: Provider, scopes?: string[]) => Promise<void>
  removeKey: (keyId: string) => Promise<void>
  getDecryptedKey: (keyId: string) => Promise<string | null>
  validateKey: (keyId: string) => Promise<boolean>
  clearError: () => void
}

export const useApiKeysStore = create<ApiKeysState>((set, get) => ({
  keys: [],
  isLoading: false,
  error: null,

  fetchKeys: async (userId: string) => {
    if (!supabase) {
      // No Supabase = just show empty state, don't error
      set({ keys: [], isLoading: false, error: null })
      return
    }

    set({ isLoading: true, error: null })

    try {
      const { data, error } = await supabase
        .from('user_api_keys')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (error) {
        // Handle auth errors gracefully - just show empty state
        const authErrors = ['JWT expired', 'invalid claim', 'session', 'token', 'unauthorized']
        const isAuthError = authErrors.some(e =>
          error.message?.toLowerCase().includes(e.toLowerCase())
        )

        if (isAuthError) {
          // Try to refresh session
          const { error: refreshError } = await supabase.auth.refreshSession()
          if (refreshError) {
            // Session truly expired - show empty state, user will need to re-login
            console.warn('Session expired, please refresh the page or sign in again')
            set({ keys: [], isLoading: false, error: null })
            return
          }
          // Retry the fetch after refresh
          const { data: retryData, error: retryError } = await supabase
            .from('user_api_keys')
            .select('*')
            .eq('user_id', userId)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })

          if (retryError) {
            set({ keys: [], isLoading: false, error: null })
            return
          }

          const keys: ApiKey[] = (retryData || []).map((row) => ({
            id: row.id,
            userId: row.user_id,
            accountId: row.account_id,
            provider: row.provider as Provider,
            providerName: row.provider_name,
            keyHint: row.key_hint,
            isValid: row.is_valid,
            lastValidatedAt: row.last_validated_at,
            lastUsedAt: row.last_used_at,
            usageCount: row.usage_count || 0,
            scopes: row.scopes || [],
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          }))
          set({ keys, isLoading: false })
          return
        }

        throw error
      }

      const keys: ApiKey[] = (data || []).map((row) => ({
        id: row.id,
        userId: row.user_id,
        accountId: row.account_id,
        provider: row.provider as Provider,
        providerName: row.provider_name,
        keyHint: row.key_hint,
        isValid: row.is_valid,
        lastValidatedAt: row.last_validated_at,
        lastUsedAt: row.last_used_at,
        usageCount: row.usage_count || 0,
        scopes: row.scopes || [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))

      set({ keys, isLoading: false })
    } catch (err) {
      // For any other errors, fail gracefully with empty state
      console.error('Failed to fetch API keys:', err)
      set({ keys: [], error: null, isLoading: false })
    }
  },

  addKey: async (userId: string, apiKey: string, provider?: Provider, scopes?: string[]) => {
    if (!supabase) {
      set({ error: 'Supabase not configured' })
      return
    }

    set({ isLoading: true, error: null })

    try {
      // Detect provider if not specified
      const detectedProvider = provider || (detectProvider(apiKey) as Provider)

      // Encrypt the key
      const encrypted: EncryptedKey = await encryptApiKey(apiKey)

      const { data, error } = await supabase
        .from('user_api_keys')
        .insert({
          user_id: userId,
          provider: detectedProvider,
          encrypted_key: encrypted.encrypted,
          key_hint: encrypted.hint,
          encryption_iv: encrypted.iv,
          scopes: scopes || ['all'],
          is_valid: true,
        })
        .select()
        .single()

      if (error) throw error

      const newKey: ApiKey = {
        id: data.id,
        userId: data.user_id,
        accountId: data.account_id,
        provider: data.provider as Provider,
        providerName: data.provider_name,
        keyHint: data.key_hint,
        isValid: data.is_valid,
        lastValidatedAt: data.last_validated_at,
        lastUsedAt: data.last_used_at,
        usageCount: data.usage_count || 0,
        scopes: data.scopes || [],
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      }

      set((state) => ({
        keys: [newKey, ...state.keys],
        isLoading: false,
      }))
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
    }
  },

  removeKey: async (keyId: string) => {
    if (!supabase) {
      set({ error: 'Supabase not configured' })
      return
    }

    set({ isLoading: true, error: null })

    try {
      // Soft delete
      const { error } = await supabase
        .from('user_api_keys')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', keyId)

      if (error) throw error

      set((state) => ({
        keys: state.keys.filter((k) => k.id !== keyId),
        isLoading: false,
      }))
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
    }
  },

  getDecryptedKey: async (keyId: string) => {
    if (!supabase) {
      set({ error: 'Supabase not configured' })
      return null
    }

    try {
      const { data, error } = await supabase
        .from('user_api_keys')
        .select('encrypted_key, encryption_iv')
        .eq('id', keyId)
        .single()

      if (error) throw error
      if (!data) return null

      const decrypted = await decryptApiKey(data.encrypted_key, data.encryption_iv)

      // Update last used
      await supabase.rpc('increment_api_key_usage', { key_id: keyId })

      return decrypted
    } catch (err) {
      set({ error: (err as Error).message })
      return null
    }
  },

  validateKey: async (keyId: string) => {
    if (!supabase) {
      set({ error: 'Supabase not configured' })
      return false
    }

    try {
      const key = get().keys.find((k) => k.id === keyId)
      if (!key) return false

      const decrypted = await get().getDecryptedKey(keyId)
      if (!decrypted) return false

      // TODO: Actually validate with the provider's API
      // For now, just mark as validated
      const { error } = await supabase
        .from('user_api_keys')
        .update({
          is_valid: true,
          last_validated_at: new Date().toISOString(),
        })
        .eq('id', keyId)

      if (error) throw error

      set((state) => ({
        keys: state.keys.map((k) =>
          k.id === keyId
            ? { ...k, isValid: true, lastValidatedAt: new Date().toISOString() }
            : k
        ),
      }))

      return true
    } catch (err) {
      set({ error: (err as Error).message })
      return false
    }
  },

  clearError: () => set({ error: null }),
}))

// Helper to get a key for a specific provider
export function useApiKeyForProvider(provider: Provider) {
  const keys = useApiKeysStore((state) => state.keys)
  return keys.find((k) => k.provider === provider && k.isValid)
}
