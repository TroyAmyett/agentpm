// Identity Service - Member Management
// CRUD operations for account members and invitations

import { supabase } from '../supabase/client'
import { userHasAccountRole } from './accounts'

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

export type MemberRole = 'owner' | 'admin' | 'member' | 'viewer'

export interface AccountMember {
  id: string
  userId: string
  accountId: string
  role: MemberRole
  isPrimary: boolean
  createdAt: string
  updatedAt: string
  // Joined from auth.users
  email?: string
  fullName?: string
  avatarUrl?: string
}

export interface AccountInvitation {
  id: string
  accountId: string
  email: string
  role: MemberRole
  invitedBy: string
  token: string
  expiresAt: string
  acceptedAt?: string
  createdAt: string
}

export interface InviteMemberInput {
  email: string
  role?: MemberRole
}

// =============================================================================
// MEMBERS
// =============================================================================

/**
 * Fetch all members of an account
 */
export async function fetchAccountMembers(accountId: string): Promise<AccountMember[]> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('Not authenticated')

  // Verify user has access to this account
  const hasAccess = await userHasAccountRole(userData.user.id, accountId, 'viewer')
  if (!hasAccess) {
    throw new Error('No access to this account')
  }

  // Fetch user_accounts with user metadata
  // Note: In a real app, you'd join with a profiles table or use auth.users RPC
  const { data, error } = await supabase
    .from('user_accounts')
    .select('*')
    .eq('account_id', accountId)

  if (error) throw error

  // For now, return basic data. In production, you'd join with profiles
  return (data || []).map((row) => toCamelCaseKeys<AccountMember>(row))
}

/**
 * Update a member's role
 */
export async function updateMemberRole(
  accountId: string,
  targetUserId: string,
  newRole: MemberRole
): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('Not authenticated')

  // Can't change your own role
  if (userData.user.id === targetUserId) {
    throw new Error('Cannot change your own role')
  }

  // Check caller has admin/owner role
  const callerHasPermission = await userHasAccountRole(userData.user.id, accountId, 'admin')
  if (!callerHasPermission) {
    throw new Error('Insufficient permissions')
  }

  // Get target user's current role
  const { data: targetData, error: targetError } = await supabase
    .from('user_accounts')
    .select('role')
    .eq('user_id', targetUserId)
    .eq('account_id', accountId)
    .single()

  if (targetError) throw targetError

  const roleOrder = ['viewer', 'member', 'admin', 'owner']
  const callerRoleData = await supabase
    .from('user_accounts')
    .select('role')
    .eq('user_id', userData.user.id)
    .eq('account_id', accountId)
    .single()

  if (callerRoleData.error) throw callerRoleData.error

  const callerRoleIndex = roleOrder.indexOf(callerRoleData.data.role)
  const targetRoleIndex = roleOrder.indexOf(targetData.role)
  const newRoleIndex = roleOrder.indexOf(newRole)

  // Can't promote to equal or higher role
  if (newRoleIndex >= callerRoleIndex) {
    throw new Error('Cannot promote to equal or higher role than yourself')
  }

  // Can't demote someone of equal or higher role
  if (targetRoleIndex >= callerRoleIndex) {
    throw new Error('Cannot change role of someone with equal or higher role')
  }

  const { error } = await supabase
    .from('user_accounts')
    .update({ role: newRole })
    .eq('user_id', targetUserId)
    .eq('account_id', accountId)

  if (error) throw error
}

/**
 * Remove a member from an account
 */
export async function removeMember(accountId: string, targetUserId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('Not authenticated')

  // Can't remove yourself (use leave instead)
  if (userData.user.id === targetUserId) {
    throw new Error('Cannot remove yourself. Use leave account instead.')
  }

  // Check caller has admin/owner role
  const callerHasPermission = await userHasAccountRole(userData.user.id, accountId, 'admin')
  if (!callerHasPermission) {
    throw new Error('Insufficient permissions')
  }

  // Get target user's role
  const { data: targetData, error: targetError } = await supabase
    .from('user_accounts')
    .select('role')
    .eq('user_id', targetUserId)
    .eq('account_id', accountId)
    .single()

  if (targetError) throw targetError

  // Can't remove an owner
  if (targetData.role === 'owner') {
    throw new Error('Cannot remove an owner')
  }

  // Get caller's role
  const roleOrder = ['viewer', 'member', 'admin', 'owner']
  const callerRoleData = await supabase
    .from('user_accounts')
    .select('role')
    .eq('user_id', userData.user.id)
    .eq('account_id', accountId)
    .single()

  if (callerRoleData.error) throw callerRoleData.error

  const callerRoleIndex = roleOrder.indexOf(callerRoleData.data.role)
  const targetRoleIndex = roleOrder.indexOf(targetData.role)

  // Can't remove someone of equal or higher role
  if (targetRoleIndex >= callerRoleIndex) {
    throw new Error('Cannot remove someone with equal or higher role')
  }

  const { error } = await supabase
    .from('user_accounts')
    .delete()
    .eq('user_id', targetUserId)
    .eq('account_id', accountId)

  if (error) throw error
}

/**
 * Leave an account (for non-owners)
 */
export async function leaveAccount(accountId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('Not authenticated')

  // Get user's role
  const { data: roleData, error: roleError } = await supabase
    .from('user_accounts')
    .select('role')
    .eq('user_id', userData.user.id)
    .eq('account_id', accountId)
    .single()

  if (roleError) throw roleError

  // Owners can't leave (must transfer ownership first)
  if (roleData.role === 'owner') {
    throw new Error('Owners cannot leave. Transfer ownership first.')
  }

  const { error } = await supabase
    .from('user_accounts')
    .delete()
    .eq('user_id', userData.user.id)
    .eq('account_id', accountId)

  if (error) throw error
}

// =============================================================================
// INVITATIONS
// =============================================================================

/**
 * Generate a secure random token
 */
function generateToken(length = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  const randomValues = new Uint32Array(length)
  crypto.getRandomValues(randomValues)
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length]
  }
  return result
}

/**
 * Invite a member to an account
 */
export async function inviteMember(
  accountId: string,
  input: InviteMemberInput
): Promise<AccountInvitation> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('Not authenticated')

  // Check caller has admin/owner role
  const hasPermission = await userHasAccountRole(userData.user.id, accountId, 'admin')
  if (!hasPermission) {
    throw new Error('Insufficient permissions to invite members')
  }

  // Note: To check if user is already a member by email, we'd need to join with auth.users
  // For now, we'll just create the invitation and handle duplicates on accept

  // Check for existing pending invitation
  const { data: existingInvite } = await supabase
    .from('account_invitations')
    .select('id')
    .eq('account_id', accountId)
    .eq('email', input.email.toLowerCase())
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .limit(1)

  if (existingInvite && existingInvite.length > 0) {
    throw new Error('An invitation already exists for this email')
  }

  const token = generateToken(48)
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7) // 7 days expiry

  const { data, error } = await supabase
    .from('account_invitations')
    .insert({
      account_id: accountId,
      email: input.email.toLowerCase(),
      role: input.role || 'member',
      invited_by: userData.user.id,
      token,
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single()

  if (error) throw error

  // TODO: Send invitation email
  console.log(`Invitation created for ${input.email}. Token: ${token}`)

  return toCamelCaseKeys<AccountInvitation>(data)
}

/**
 * Fetch pending invitations for an account
 */
export async function fetchAccountInvitations(accountId: string): Promise<AccountInvitation[]> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('Not authenticated')

  // Check caller has admin/owner role
  const hasPermission = await userHasAccountRole(userData.user.id, accountId, 'admin')
  if (!hasPermission) {
    throw new Error('Insufficient permissions')
  }

  const { data, error } = await supabase
    .from('account_invitations')
    .select('*')
    .eq('account_id', accountId)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data || []).map((row) => toCamelCaseKeys<AccountInvitation>(row))
}

/**
 * Accept an invitation
 */
export async function acceptInvitation(token: string): Promise<{ accountId: string }> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('Not authenticated')

  // Find the invitation
  const { data: invitation, error: inviteError } = await supabase
    .from('account_invitations')
    .select('*')
    .eq('token', token)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (inviteError || !invitation) {
    throw new Error('Invalid or expired invitation')
  }

  // Verify email matches (case-insensitive)
  if (invitation.email.toLowerCase() !== userData.user.email?.toLowerCase()) {
    throw new Error('This invitation is for a different email address')
  }

  // Check if user is already a member
  const { data: existingMembership } = await supabase
    .from('user_accounts')
    .select('id')
    .eq('user_id', userData.user.id)
    .eq('account_id', invitation.account_id)
    .limit(1)

  if (existingMembership && existingMembership.length > 0) {
    // Mark invitation as accepted anyway
    await supabase
      .from('account_invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invitation.id)

    throw new Error('You are already a member of this account')
  }

  // Create user_accounts entry
  const { error: memberError } = await supabase
    .from('user_accounts')
    .insert({
      user_id: userData.user.id,
      account_id: invitation.account_id,
      role: invitation.role,
      is_primary: false,
    })

  if (memberError) throw memberError

  // Mark invitation as accepted
  const { error: updateError } = await supabase
    .from('account_invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invitation.id)

  if (updateError) throw updateError

  return { accountId: invitation.account_id }
}

/**
 * Cancel/delete an invitation
 */
export async function cancelInvitation(invitationId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('Not authenticated')

  // Get the invitation to find the account
  const { data: invitation, error: inviteError } = await supabase
    .from('account_invitations')
    .select('account_id')
    .eq('id', invitationId)
    .single()

  if (inviteError) throw inviteError

  // Check caller has admin/owner role
  const hasPermission = await userHasAccountRole(userData.user.id, invitation.account_id, 'admin')
  if (!hasPermission) {
    throw new Error('Insufficient permissions')
  }

  const { error } = await supabase
    .from('account_invitations')
    .delete()
    .eq('id', invitationId)

  if (error) throw error
}

/**
 * Resend an invitation (creates a new token and extends expiry)
 */
export async function resendInvitation(invitationId: string): Promise<AccountInvitation> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('Not authenticated')

  // Get the invitation
  const { data: invitation, error: inviteError } = await supabase
    .from('account_invitations')
    .select('*')
    .eq('id', invitationId)
    .single()

  if (inviteError) throw inviteError

  // Check caller has admin/owner role
  const hasPermission = await userHasAccountRole(userData.user.id, invitation.account_id, 'admin')
  if (!hasPermission) {
    throw new Error('Insufficient permissions')
  }

  const newToken = generateToken(48)
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)

  const { data, error } = await supabase
    .from('account_invitations')
    .update({
      token: newToken,
      expires_at: expiresAt.toISOString(),
    })
    .eq('id', invitationId)
    .select()
    .single()

  if (error) throw error

  // TODO: Send invitation email
  console.log(`Invitation resent for ${data.email}. New token: ${newToken}`)

  return toCamelCaseKeys<AccountInvitation>(data)
}
