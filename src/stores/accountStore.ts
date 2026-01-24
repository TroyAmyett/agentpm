import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AccountWithConfig, AccountType, AccountConfig } from '@/types/agentpm'
import { supabase, isAuthError, handleAuthError } from '@/services/supabase/client'
import {
  fetchUserAccounts,
  updateAccount as updateAccountService,
  deleteAccount as deleteAccountService,
  ensureUserHasAccount,
} from '@/services/identity/accounts'

// Default account shown before user logs in
// Each user has exactly ONE account - use different email for different accounts
const DEFAULT_ACCOUNT: Partial<AccountWithConfig> = {
  id: 'default-demo',
  name: 'Demo Account',
  slug: 'demo',
  status: 'active',
  type: 'personal',
  config: {
    defaultTone: 'casual',
  },
}

interface AccountWithRole extends AccountWithConfig {
  role?: string
  isPrimary?: boolean
}

interface AccountState {
  // State
  accounts: AccountWithRole[]
  currentAccountId: string | null
  isLoading: boolean
  error: string | null

  // Getters
  currentAccount: () => AccountWithRole | null
  getAccountsByType: (type: AccountType) => AccountWithRole[]
  getUserRole: () => string | null

  // Actions
  fetchAccounts: () => Promise<void>
  initializeUserAccounts: () => Promise<void>
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
      accounts: [DEFAULT_ACCOUNT as AccountWithRole],
      currentAccountId: 'default-demo',
      isLoading: false,
      error: null,

      currentAccount: () => {
        const { accounts, currentAccountId } = get()
        return accounts.find((a) => a.id === currentAccountId) || null
      },

      getAccountsByType: (type: AccountType) => {
        return get().accounts.filter((a) => a.type === type)
      },

      getUserRole: () => {
        const account = get().currentAccount()
        return account?.role || null
      },

      fetchAccounts: async () => {
        if (!supabase) {
          // Use default account if Supabase not configured
          return
        }

        set({ isLoading: true, error: null })

        try {
          // Fetch user's account (they only have ONE)
          const userAccounts = await fetchUserAccounts()

          if (userAccounts.length > 0) {
            // User has an account - use it
            const account = userAccounts[0] as AccountWithRole
            set({
              accounts: [account],
              currentAccountId: account.id,
              isLoading: false,
            })
          } else {
            // No account yet - keep showing demo
            set({
              accounts: [DEFAULT_ACCOUNT as AccountWithRole],
              currentAccountId: 'default-demo',
              isLoading: false,
            })
          }
        } catch (error) {
          // Check if this is an auth error (expired JWT, etc.)
          if (isAuthError(error)) {
            console.warn('[AccountStore] Auth error detected, signing out...')
            await handleAuthError()
            return
          }

          // Fallback to default account on error
          console.error('[AccountStore] Failed to fetch account:', error)
          set({
            accounts: [DEFAULT_ACCOUNT as AccountWithRole],
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to fetch account',
          })
        }
      },

      initializeUserAccounts: async () => {
        if (!supabase) return

        set({ isLoading: true, error: null })

        try {
          // Ensure user has their account (creates one if new user)
          const account = await ensureUserHasAccount()

          // Set the user's account as current
          set({
            accounts: [{ ...account, role: 'owner' } as AccountWithRole],
            currentAccountId: account.id,
            isLoading: false,
          })
        } catch (error) {
          // Check if this is an auth error (expired JWT, etc.)
          if (isAuthError(error)) {
            console.warn('[AccountStore] Auth error during initialization, signing out...')
            await handleAuthError()
            return
          }

          console.error('[AccountStore] Failed to initialize account:', error)
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to initialize account',
          })
        }
      },

      selectAccount: (accountId: string) => {
        const account = get().accounts.find((a) => a.id === accountId)
        if (account) {
          set({ currentAccountId: accountId })
        }
      },

      createAccount: async (_accountData) => {
        // Users can only have ONE account
        // If you want a different account, use a different email address
        const { accounts } = get()
        const hasRealAccount = accounts.some(a => !a.id?.startsWith('default-'))

        if (hasRealAccount) {
          const error = new Error('You already have an account. Each email can only have one account. Use a different email for a separate account.')
          set({ error: error.message })
          throw error
        }

        // This should only be called during initial setup via ensureUserHasAccount
        throw new Error('Account creation is handled automatically. Sign in with a new email for a new account.')
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
          await updateAccountService(accountId, {
            name: updates.name,
            slug: updates.slug,
            status: updates.status,
            type: updates.type,
            config: updates.config,
            billingEmail: updates.billingEmail,
          })

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
          await deleteAccountService(accountId)

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
