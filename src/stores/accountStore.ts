import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AccountWithConfig, AccountType, AccountConfig } from '@/types/agentpm'
import { supabase } from '@/services/supabase/client'

// Default accounts as per PRD
const DEFAULT_ACCOUNTS: Partial<AccountWithConfig>[] = [
  {
    id: 'default-funnelists',
    name: 'Funnelists',
    slug: 'funnelists',
    status: 'active',
    type: 'internal',
    config: {
      website: 'https://funnelists.com',
      defaultTone: 'conversational',
      specialInstructions: 'Focus on Salesforce ecosystem and Agentforce',
    },
  },
  {
    id: 'default-personal',
    name: 'Personal',
    slug: 'personal',
    status: 'active',
    type: 'personal',
    config: {
      defaultTone: 'casual',
    },
  },
]

interface AccountState {
  // State
  accounts: AccountWithConfig[]
  currentAccountId: string | null
  isLoading: boolean
  error: string | null

  // Getters
  currentAccount: () => AccountWithConfig | null
  getAccountsByType: (type: AccountType) => AccountWithConfig[]

  // Actions
  fetchAccounts: () => Promise<void>
  selectAccount: (accountId: string) => void
  createAccount: (
    account: Omit<AccountWithConfig, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'createdByType' | 'updatedByType' | 'accountId'>
  ) => Promise<AccountWithConfig>
  updateAccount: (accountId: string, updates: Partial<AccountWithConfig>) => Promise<void>
  updateAccountConfig: (accountId: string, config: Partial<AccountConfig>) => Promise<void>
  deleteAccount: (accountId: string) => Promise<void>
  clearError: () => void
}

export const useAccountStore = create<AccountState>()(
  persist(
    (set, get) => ({
      accounts: DEFAULT_ACCOUNTS as AccountWithConfig[],
      currentAccountId: 'default-funnelists',
      isLoading: false,
      error: null,

      currentAccount: () => {
        const { accounts, currentAccountId } = get()
        return accounts.find((a) => a.id === currentAccountId) || null
      },

      getAccountsByType: (type: AccountType) => {
        return get().accounts.filter((a) => a.type === type)
      },

      fetchAccounts: async () => {
        if (!supabase) {
          // Use default accounts if Supabase not configured
          return
        }

        set({ isLoading: true, error: null })

        try {
          const { data, error } = await supabase
            .from('accounts')
            .select('*')
            .is('deleted_at', null)
            .order('name')

          if (error) throw error

          // Convert snake_case to camelCase and merge with defaults
          const fetchedAccounts = (data || []).map((acc) => ({
            id: acc.id,
            accountId: acc.account_id,
            name: acc.name,
            slug: acc.slug,
            status: acc.status,
            type: acc.type || 'internal',
            config: acc.config || {},
            settings: acc.settings,
            currency: acc.currency,
            billingEmail: acc.billing_email,
            stripeCustomerId: acc.stripe_customer_id,
            plan: acc.plan,
            planExpiresAt: acc.plan_expires_at,
            branding: acc.branding,
            createdAt: acc.created_at,
            createdBy: acc.created_by,
            createdByType: acc.created_by_type,
            updatedAt: acc.updated_at,
            updatedBy: acc.updated_by,
            updatedByType: acc.updated_by_type,
          })) as AccountWithConfig[]

          // If no accounts fetched, keep defaults
          const accounts = fetchedAccounts.length > 0 ? fetchedAccounts : DEFAULT_ACCOUNTS as AccountWithConfig[]

          set({
            accounts,
            isLoading: false,
            // Select first account if current one doesn't exist
            currentAccountId: get().currentAccountId && accounts.some((a) => a.id === get().currentAccountId)
              ? get().currentAccountId
              : accounts[0]?.id || null,
          })
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to fetch accounts',
          })
        }
      },

      selectAccount: (accountId: string) => {
        const account = get().accounts.find((a) => a.id === accountId)
        if (account) {
          set({ currentAccountId: accountId })
        }
      },

      createAccount: async (accountData) => {
        if (!supabase) {
          // Create locally if Supabase not configured
          const newAccount: AccountWithConfig = {
            ...accountData,
            id: `local-${Date.now()}`,
            accountId: `local-${Date.now()}`,
            createdAt: new Date().toISOString(),
            createdBy: 'local-user',
            createdByType: 'user',
            updatedAt: new Date().toISOString(),
            updatedBy: 'local-user',
            updatedByType: 'user',
          }
          set((state) => ({
            accounts: [...state.accounts, newAccount],
          }))
          return newAccount
        }

        set({ isLoading: true, error: null })

        try {
          const { data: userData } = await supabase.auth.getUser()
          const userId = userData.user?.id

          const { data, error } = await supabase
            .from('accounts')
            .insert({
              name: accountData.name,
              slug: accountData.slug,
              status: accountData.status || 'active',
              type: accountData.type,
              config: accountData.config || {},
              created_by: userId,
              created_by_type: 'user',
              updated_by: userId,
              updated_by_type: 'user',
            })
            .select()
            .single()

          if (error) throw error

          const newAccount: AccountWithConfig = {
            id: data.id,
            accountId: data.account_id,
            name: data.name,
            slug: data.slug,
            status: data.status,
            type: data.type,
            config: data.config,
            createdAt: data.created_at,
            createdBy: data.created_by,
            createdByType: data.created_by_type,
            updatedAt: data.updated_at,
            updatedBy: data.updated_by,
            updatedByType: data.updated_by_type,
          }

          set((state) => ({
            accounts: [...state.accounts, newAccount],
            isLoading: false,
          }))

          return newAccount
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to create account',
          })
          throw error
        }
      },

      updateAccount: async (accountId, updates) => {
        if (!supabase) {
          // Update locally
          set((state) => ({
            accounts: state.accounts.map((a) =>
              a.id === accountId ? { ...a, ...updates, updatedAt: new Date().toISOString() } : a
            ),
          }))
          return
        }

        set({ isLoading: true, error: null })

        try {
          const { data: userData } = await supabase.auth.getUser()
          const userId = userData.user?.id

          const { error } = await supabase
            .from('accounts')
            .update({
              name: updates.name,
              slug: updates.slug,
              status: updates.status,
              type: updates.type,
              config: updates.config,
              updated_by: userId,
              updated_by_type: 'user',
            })
            .eq('id', accountId)

          if (error) throw error

          set((state) => ({
            accounts: state.accounts.map((a) =>
              a.id === accountId
                ? { ...a, ...updates, updatedAt: new Date().toISOString() }
                : a
            ),
            isLoading: false,
          }))
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to update account',
          })
          throw error
        }
      },

      updateAccountConfig: async (accountId, configUpdates) => {
        const account = get().accounts.find((a) => a.id === accountId)
        if (!account) return

        const newConfig = { ...account.config, ...configUpdates }
        await get().updateAccount(accountId, { config: newConfig })
      },

      deleteAccount: async (accountId) => {
        // Prevent deleting default accounts
        if (accountId.startsWith('default-')) {
          set({ error: 'Cannot delete default accounts' })
          return
        }

        if (!supabase) {
          set((state) => ({
            accounts: state.accounts.filter((a) => a.id !== accountId),
            currentAccountId:
              state.currentAccountId === accountId
                ? state.accounts[0]?.id || null
                : state.currentAccountId,
          }))
          return
        }

        set({ isLoading: true, error: null })

        try {
          const { data: userData } = await supabase.auth.getUser()
          const userId = userData.user?.id

          // Soft delete
          const { error } = await supabase
            .from('accounts')
            .update({
              deleted_at: new Date().toISOString(),
              deleted_by: userId,
              deleted_by_type: 'user',
            })
            .eq('id', accountId)

          if (error) throw error

          set((state) => ({
            accounts: state.accounts.filter((a) => a.id !== accountId),
            currentAccountId:
              state.currentAccountId === accountId
                ? state.accounts.find((a) => a.id !== accountId)?.id || null
                : state.currentAccountId,
            isLoading: false,
          }))
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to delete account',
          })
          throw error
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'agentpm-accounts',
      partialize: (state) => ({
        currentAccountId: state.currentAccountId,
      }),
    }
  )
)
