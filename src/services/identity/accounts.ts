// Identity Service - Account Management
// CRUD operations for accounts and user_accounts

import { supabase } from '../supabase/client'
import type { AccountWithConfig, AccountType, AccountConfig } from '@/types/agentpm'

// =============================================================================
// HELPER: Convert camelCase to snake_case for database
// =============================================================================


function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
}

function toCamelCaseKeys<T>(obj: Record<string, unknown>): T {
  const result: Record<string, unknown> = {}
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[toCamelCase(key)] = obj[key]
    }
  }
  return result as T
}

// =============================================================================
// TYPES
// =============================================================================

export interface UserAccount {
  id: string
  userId: string
  accountId: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  isPrimary: boolean
  createdAt: string
  updatedAt: string
}

export interface AccountMember {
  id: string
  userId: string
  accountId: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  isPrimary: boolean
  createdAt: string
  email?: string
  fullName?: string
}

export interface CreateAccountInput {
  name: string
  slug?: string
  type?: AccountType
  config?: AccountConfig
  billingEmail?: string
}

export interface UpdateAccountInput {
  name?: string
  slug?: string
  type?: AccountType
  config?: AccountConfig
  billingEmail?: string
  status?: 'active' | 'suspended' | 'cancelled'
}

// =============================================================================
// ACCOUNTS
// =============================================================================

/**
 * Fetch all accounts for the current user
 */
export async function fetchUserAccounts(): Promise<(AccountWithConfig & { role: string })[]> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('user_accounts')
    .select(`
      role,
      is_primary,
      accounts (*)
    `)
    .eq('user_id', userData.user.id)

  if (error) throw error

  return (data || []).map((row: Record<string, unknown>) => {
    const account = row.accounts as Record<string, unknown>
    return {
      ...toCamelCaseKeys<AccountWithConfig>(account),
      role: row.role as string,
      isPrimary: row.is_primary as boolean,
    }
  })
}

/**
 * Fetch a specific account by ID
 */
export async function fetchAccount(accountId: string): Promise<AccountWithConfig | null> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', accountId)
    .is('deleted_at', null)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }

  return toCamelCaseKeys<AccountWithConfig>(data)
}

/**
 * Create a new account
 * Automatically creates user_accounts entry with owner role
 */
export async function createAccount(input: CreateAccountInput): Promise<AccountWithConfig> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('Not authenticated')

  const userId = userData.user.id
  const slug = input.slug || input.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

  // Create account
  const { data: accountData, error: accountError } = await supabase
    .from('accounts')
    .insert({
      name: input.name,
      slug,
      status: 'active',
      type: input.type || 'internal',
      config: input.config || {},
      billing_email: input.billingEmail || userData.user.email,
      created_by: userId,
      created_by_type: 'user',
      updated_by: userId,
      updated_by_type: 'user',
    })
    .select()
    .single()

  if (accountError) throw accountError

  // Create user_accounts entry with owner role
  const { error: linkError } = await supabase
    .from('user_accounts')
    .insert({
      user_id: userId,
      account_id: accountData.id,
      role: 'owner',
      is_primary: false, // Will be updated if this is the first account
    })

  if (linkError) {
    // Rollback account creation
    await supabase.from('accounts').delete().eq('id', accountData.id)
    throw linkError
  }

  return toCamelCaseKeys<AccountWithConfig>(accountData)
}

/**
 * Update an account
 */
export async function updateAccount(
  accountId: string,
  updates: UpdateAccountInput
): Promise<AccountWithConfig> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('Not authenticated')

  // Verify user has admin/owner role
  const hasPermission = await userHasAccountRole(userData.user.id, accountId, 'admin')
  if (!hasPermission) {
    throw new Error('Insufficient permissions to update account')
  }

  const updateData: Record<string, unknown> = {
    updated_by: userData.user.id,
    updated_by_type: 'user',
  }

  if (updates.name !== undefined) updateData.name = updates.name
  if (updates.slug !== undefined) updateData.slug = updates.slug
  if (updates.type !== undefined) updateData.type = updates.type
  if (updates.config !== undefined) updateData.config = updates.config
  if (updates.billingEmail !== undefined) updateData.billing_email = updates.billingEmail
  if (updates.status !== undefined) updateData.status = updates.status

  const { data, error } = await supabase
    .from('accounts')
    .update(updateData)
    .eq('id', accountId)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) throw error

  return toCamelCaseKeys<AccountWithConfig>(data)
}

/**
 * Soft delete an account
 */
export async function deleteAccount(accountId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('Not authenticated')

  // Verify user is owner
  const hasPermission = await userHasAccountRole(userData.user.id, accountId, 'owner')
  if (!hasPermission) {
    throw new Error('Only owners can delete accounts')
  }

  const { error } = await supabase
    .from('accounts')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: userData.user.id,
      deleted_by_type: 'user',
    })
    .eq('id', accountId)

  if (error) throw error
}

// =============================================================================
// USER ACCOUNTS (Membership)
// =============================================================================

/**
 * Get user's role in an account
 */
export async function getUserAccountRole(
  userId: string,
  accountId: string
): Promise<UserAccount | null> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('user_accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('account_id', accountId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }

  return toCamelCaseKeys<UserAccount>(data)
}

/**
 * Check if user has at least the specified role
 */
export async function userHasAccountRole(
  userId: string,
  accountId: string,
  minRole: 'viewer' | 'member' | 'admin' | 'owner'
): Promise<boolean> {
  const roleOrder = ['viewer', 'member', 'admin', 'owner']
  const userAccount = await getUserAccountRole(userId, accountId)

  if (!userAccount) return false

  const userRoleIndex = roleOrder.indexOf(userAccount.role)
  const minRoleIndex = roleOrder.indexOf(minRole)

  return userRoleIndex >= minRoleIndex
}

/**
 * Set user's primary account
 */
export async function setPrimaryAccount(accountId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('Not authenticated')

  // First, unset all primary flags
  await supabase
    .from('user_accounts')
    .update({ is_primary: false })
    .eq('user_id', userData.user.id)

  // Set the new primary
  const { error } = await supabase
    .from('user_accounts')
    .update({ is_primary: true })
    .eq('user_id', userData.user.id)
    .eq('account_id', accountId)

  if (error) throw error
}

// =============================================================================
// AUTO-CREATE ACCOUNT ON SIGNUP
// =============================================================================

/**
 * Ensure user has exactly ONE account (create default if needed)
 * Called after signup/login
 *
 * IMPORTANT: Each user can only belong to ONE account.
 * If you want a separate account, use a different email address.
 */
export async function ensureUserHasAccount(): Promise<AccountWithConfig> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('Not authenticated')

  // Check if user already has an account (they can only have ONE)
  const { data: existingAccount, error: fetchError } = await supabase
    .from('user_accounts')
    .select('account_id')
    .eq('user_id', userData.user.id)
    .single()

  if (fetchError && fetchError.code !== 'PGRST116') {
    // PGRST116 = no rows found, which is fine for new users
    throw fetchError
  }

  if (existingAccount) {
    // User already has an account - return it
    const account = await fetchAccount(existingAccount.account_id)
    if (account) return account
  }

  // New user - create their account
  // Use email prefix as default account name
  const emailPrefix = userData.user.email?.split('@')[0] || 'My Account'
  const accountName = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1)

  const account = await createAccount({
    name: accountName,
    slug: `${emailPrefix.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${userData.user.id.slice(0, 8)}`,
    type: 'personal',
    config: {
      defaultTone: 'casual',
    },
  })

  // Set it as primary (it's their only account)
  await setPrimaryAccount(account.id)

  return account
}
