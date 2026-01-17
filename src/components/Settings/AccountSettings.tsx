// Account Settings Component
// Manage user's accounts, members, and invitations

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Building2,
  Users,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  RefreshCw,
  Mail,
  Crown,
  Shield,
  User,
  Eye,
  X,
} from 'lucide-react'
import { useAccountStore } from '@/stores/accountStore'
import {
  fetchAccountMembers,
  fetchAccountInvitations,
  inviteMember,
  updateMemberRole,
  removeMember,
  cancelInvitation,
  resendInvitation,
  type AccountMember,
  type AccountInvitation,
  type MemberRole,
} from '@/services/identity/members'
import type { AccountWithConfig } from '@/types/agentpm'

export function AccountSettings() {
  const { accounts, currentAccountId } = useAccountStore()
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(currentAccountId)

  const account = accounts.find((a) => a.id === selectedAccountId)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2
          className="text-lg font-medium flex items-center gap-2"
          style={{ color: 'var(--fl-color-text-primary)' }}
        >
          <Building2 size={20} />
          Account Settings
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--fl-color-text-muted)' }}>
          Manage your accounts and team members
        </p>
      </div>

      {/* Account Selector */}
      <div
        className="p-4 rounded-xl"
        style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid var(--fl-color-border)',
        }}
      >
        <label
          className="block text-xs mb-2"
          style={{ color: 'var(--fl-color-text-muted)' }}
        >
          Select Account
        </label>
        <select
          value={selectedAccountId || ''}
          onChange={(e) => setSelectedAccountId(e.target.value)}
          className="w-full px-3 py-2 rounded-lg text-sm"
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid var(--fl-color-border)',
            color: 'var(--fl-color-text-primary)',
          }}
        >
          {accounts.map((acc) => (
            <option key={acc.id} value={acc.id}>
              {acc.name} ({acc.type})
            </option>
          ))}
        </select>
      </div>

      {account && (
        <>
          {/* Account Details */}
          <AccountDetailsSection account={account} />

          {/* Members */}
          <MembersSection accountId={account.id} />
        </>
      )}
    </div>
  )
}

// Account Details Section
function AccountDetailsSection({ account }: { account: AccountWithConfig }) {
  const { updateAccount } = useAccountStore()
  const [isEditing, setIsEditing] = useState(false)
  const [name, setName] = useState(account.name)
  const [billingEmail, setBillingEmail] = useState(account.billingEmail || '')
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await updateAccount(account.id, { name, billingEmail })
      setIsEditing(false)
    } catch (err) {
      console.error('Failed to update account:', err)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      className="p-4 rounded-xl"
      style={{
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid var(--fl-color-border)',
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium" style={{ color: 'var(--fl-color-text-primary)' }}>
          General
        </h3>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="text-xs px-3 py-1 rounded"
            style={{ background: 'rgba(14, 165, 233, 0.2)', color: '#0ea5e9' }}
          >
            Edit
          </button>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--fl-color-text-muted)' }}>
            Account Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!isEditing}
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={{
              background: isEditing ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
              border: isEditing ? '1px solid var(--fl-color-border)' : 'none',
              color: 'var(--fl-color-text-primary)',
            }}
          />
        </div>

        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--fl-color-text-muted)' }}>
            Slug
          </label>
          <input
            type="text"
            value={account.slug}
            disabled
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={{
              background: 'transparent',
              color: 'var(--fl-color-text-muted)',
            }}
          />
        </div>

        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--fl-color-text-muted)' }}>
            Billing Email
          </label>
          <input
            type="email"
            value={billingEmail}
            onChange={(e) => setBillingEmail(e.target.value)}
            disabled={!isEditing}
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={{
              background: isEditing ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
              border: isEditing ? '1px solid var(--fl-color-border)' : 'none',
              color: 'var(--fl-color-text-primary)',
            }}
          />
        </div>

        <div className="flex items-center gap-4 text-sm" style={{ color: 'var(--fl-color-text-muted)' }}>
          <span>Type: <span className="capitalize">{account.type}</span></span>
          <span>Plan: <span className="capitalize">{account.plan || 'Free'}</span></span>
          <span>Status: <span className="capitalize">{account.status}</span></span>
        </div>

        {isEditing && (
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => {
                setIsEditing(false)
                setName(account.name)
                setBillingEmail(account.billingEmail || '')
              }}
              className="px-4 py-2 rounded-lg text-sm"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'var(--fl-color-text-secondary)',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: 'var(--fl-color-primary)' }}
            >
              {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
              Save
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Members Section
function MembersSection({ accountId }: { accountId: string }) {
  const [members, setMembers] = useState<AccountMember[]>([])
  const [invitations, setInvitations] = useState<AccountInvitation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showInviteForm, setShowInviteForm] = useState(false)

  useEffect(() => {
    loadData()
  }, [accountId])

  const loadData = async () => {
    try {
      setIsLoading(true)
      const [membersData, invitesData] = await Promise.all([
        fetchAccountMembers(accountId),
        fetchAccountInvitations(accountId),
      ])
      setMembers(membersData)
      setInvitations(invitesData)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load members')
    } finally {
      setIsLoading(false)
    }
  }

  const handleInvite = async (email: string, role: MemberRole) => {
    try {
      const invitation = await inviteMember(accountId, { email, role })
      setInvitations([...invitations, invitation])
      setShowInviteForm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite member')
    }
  }

  const handleRemoveMember = async (userId: string) => {
    try {
      await removeMember(accountId, userId)
      setMembers(members.filter((m) => m.userId !== userId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member')
    }
  }

  const handleCancelInvitation = async (invitationId: string) => {
    try {
      await cancelInvitation(invitationId)
      setInvitations(invitations.filter((i) => i.id !== invitationId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel invitation')
    }
  }

  const handleResendInvitation = async (invitationId: string) => {
    try {
      const updated = await resendInvitation(invitationId)
      setInvitations(invitations.map((i) => (i.id === invitationId ? updated : i)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend invitation')
    }
  }

  const handleUpdateRole = async (userId: string, role: MemberRole) => {
    try {
      await updateMemberRole(accountId, userId, role)
      setMembers(members.map((m) => (m.userId === userId ? { ...m, role } : m)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role')
    }
  }

  const roleIcon = (role: MemberRole) => {
    switch (role) {
      case 'owner':
        return <Crown size={14} className="text-yellow-500" />
      case 'admin':
        return <Shield size={14} className="text-cyan-400" />
      case 'member':
        return <User size={14} className="text-gray-400" />
      case 'viewer':
        return <Eye size={14} className="text-gray-500" />
    }
  }

  return (
    <div
      className="p-4 rounded-xl"
      style={{
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid var(--fl-color-border)',
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium flex items-center gap-2" style={{ color: 'var(--fl-color-text-primary)' }}>
          <Users size={18} />
          Members
        </h3>
        <button
          onClick={() => setShowInviteForm(true)}
          className="flex items-center gap-1 text-xs px-3 py-1 rounded"
          style={{ background: 'rgba(14, 165, 233, 0.2)', color: '#0ea5e9' }}
        >
          <Plus size={14} />
          Invite
        </button>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-2 p-2 rounded mb-4"
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              color: '#ef4444',
            }}
          >
            <AlertCircle size={14} />
            <span className="text-xs">{error}</span>
            <button onClick={() => setError(null)} className="ml-auto">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Invite Form */}
      <AnimatePresence>
        {showInviteForm && (
          <InviteMemberForm
            onInvite={handleInvite}
            onCancel={() => setShowInviteForm(false)}
          />
        )}
      </AnimatePresence>

      {/* Loading */}
      {isLoading ? (
        <div className="flex items-center justify-center py-4" style={{ color: 'var(--fl-color-text-muted)' }}>
          <RefreshCw size={16} className="animate-spin mr-2" />
          Loading members...
        </div>
      ) : (
        <div className="space-y-2">
          {/* Members List */}
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5"
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(14, 165, 233, 0.2)' }}
              >
                <User size={16} className="text-cyan-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm truncate" style={{ color: 'var(--fl-color-text-primary)' }}>
                    {member.email || member.userId.slice(0, 8)}
                  </span>
                  {roleIcon(member.role)}
                </div>
                <span className="text-xs capitalize" style={{ color: 'var(--fl-color-text-muted)' }}>
                  {member.role}
                </span>
              </div>
              {member.role !== 'owner' && (
                <div className="flex items-center gap-1">
                  <select
                    value={member.role}
                    onChange={(e) => handleUpdateRole(member.userId, e.target.value as MemberRole)}
                    className="text-xs px-2 py-1 rounded"
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--fl-color-border)',
                      color: 'var(--fl-color-text-secondary)',
                    }}
                  >
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button
                    onClick={() => handleRemoveMember(member.userId)}
                    className="p-1 rounded hover:bg-red-500/10"
                    style={{ color: 'var(--fl-color-text-muted)' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* Pending Invitations */}
          {invitations.length > 0 && (
            <>
              <div className="pt-4 pb-2">
                <h4 className="text-xs font-medium" style={{ color: 'var(--fl-color-text-muted)' }}>
                  Pending Invitations
                </h4>
              </div>
              {invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex items-center gap-3 p-2 rounded-lg bg-yellow-500/5"
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(234, 179, 8, 0.2)' }}
                  >
                    <Mail size={16} className="text-yellow-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm truncate" style={{ color: 'var(--fl-color-text-primary)' }}>
                      {invitation.email}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs capitalize" style={{ color: 'var(--fl-color-text-muted)' }}>
                        {invitation.role}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
                        Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleResendInvitation(invitation.id)}
                    className="text-xs px-2 py-1 rounded"
                    style={{ background: 'rgba(14, 165, 233, 0.2)', color: '#0ea5e9' }}
                  >
                    Resend
                  </button>
                  <button
                    onClick={() => handleCancelInvitation(invitation.id)}
                    className="p-1 rounded hover:bg-red-500/10"
                    style={{ color: 'var(--fl-color-text-muted)' }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </>
          )}

          {members.length === 0 && invitations.length === 0 && (
            <div className="text-center py-4" style={{ color: 'var(--fl-color-text-muted)' }}>
              <Users size={24} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No members yet</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Invite Member Form
function InviteMemberForm({
  onInvite,
  onCancel,
}: {
  onInvite: (email: string, role: MemberRole) => Promise<void>
  onCancel: () => void
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<MemberRole>('member')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return

    setIsSubmitting(true)
    try {
      await onInvite(email, role)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <motion.form
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      onSubmit={handleSubmit}
      className="p-3 rounded-lg mb-4"
      style={{
        background: 'rgba(14, 165, 233, 0.05)',
        border: '1px solid rgba(14, 165, 233, 0.2)',
      }}
    >
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="block text-xs mb-1" style={{ color: 'var(--fl-color-text-muted)' }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--fl-color-border)',
              color: 'var(--fl-color-text-primary)',
            }}
          />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--fl-color-text-muted)' }}>
            Role
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as MemberRole)}
            className="px-3 py-2 rounded-lg text-sm"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--fl-color-border)',
              color: 'var(--fl-color-text-primary)',
            }}
          >
            <option value="admin">Admin</option>
            <option value="member">Member</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={isSubmitting || !email}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
          style={{ background: 'var(--fl-color-primary)' }}
        >
          {isSubmitting ? <RefreshCw size={14} className="animate-spin" /> : 'Invite'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm"
          style={{ color: 'var(--fl-color-text-secondary)' }}
        >
          Cancel
        </button>
      </div>
    </motion.form>
  )
}

export default AccountSettings
