import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AccountWithConfig, AccountType, AccountConfig } from '@/types/agentpm'
import { supabase } from '@/services/supabase/client'
import {
  fetchUserAccounts,
  createAccount as createAccountService,
  updateAccount as updateAccountService,
  deleteAccount as deleteAccountService,
  ensureUserHasAccount,
} from '@/services/identity/accounts'

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
      accounts: DEFAULT_ACCOUNTS as AccountWithRole[],
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

      getUserRole: () => {
        const account = get().currentAccount()
        return account?.role || null
      },

      fetchAccounts: async () => {
        if (!supabase) {
          // Use default accounts if Supabase not configured
          return
        }

        set({ isLoading: true, error: null })

        try {
          // Use the new identity service to fetch user's accounts
          const userAccounts = await fetchUserAccounts()

          // If no accounts fetched, keep defaults
          const accounts = userAccounts.length > 0
            ? userAccounts as AccountWithRole[]
            : DEFAULT_ACCOUNTS as AccountWithRole[]

          // Find primary account or first account
          const primaryAccount = userAccounts.find((a) => (a as AccountWithRole).isPrimary) || userAccounts[0]
          const currentId = get().currentAccountId

          set({
            accounts,
            isLoading: false,
            // Select primary account if current one doesn't exist
            currentAccountId: currentId && accounts.some((a) => a.id === currentId)
              ? currentId
              : primaryAccount?.id || accounts[0]?.id || null,
          })
        } catch (error) {
          // Fallback to default accounts on error
          set({
            accounts: DEFAULT_ACCOUNTS as AccountWithRole[],
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to fetch accounts',
          })
        }
      },

      initializeUserAccounts: async () => {
        if (!supabase) return

        set({ isLoading: true, error: null })

        try {
          // Ensure user has at least one account
          await ensureUserHasAccount()

          // Refresh the accounts list - this preserves currentAccountId if valid
          await get().fetchAccounts()

          // Only set account if none selected (fetchAccounts already handles this)
          const { currentAccountId, accounts } = get()
          if (!currentAccountId || !accounts.some((a) => a.id === currentAccountId)) {
            // Fallback to first account if persisted one is invalid
            const firstAccount = accounts[0]
            if (firstAccount) {
              set({ currentAccountId: firstAccount.id })
            }
          }
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to initialize accounts',
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
          const newAccount: AccountWithRole = {
            ...accountData,
            id: `local-${Date.now()}`,
            accountId: `local-${Date.now()}`,
            createdAt: new Date().toISOString(),
            createdBy: 'local-user',
            createdByType: 'user',
            updatedAt: new Date().toISOString(),
            updatedBy: 'local-user',
            updatedByType: 'user',
            role: 'owner',
          }
          set((state) => ({
            accounts: [...state.accounts, newAccount],
          }))
          return newAccount
        }

        set({ isLoading: true, error: null })

        try {
          const newAccount = await createAccountService({
            name: accountData.name,
            slug: accountData.slug,
            type: accountData.type,
            config: accountData.config,
          })

          const accountWithRole: AccountWithRole = {
            ...newAccount,
            role: 'owner',
          }

          set((state) => ({
            accounts: [...state.accounts, accountWithRole],
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
