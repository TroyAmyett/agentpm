// Identity Service
// SSO, Account Management, Member Management, and Tool Registration

// Accounts
export {
  fetchUserAccounts,
  fetchAccount,
  createAccount,
  updateAccount,
  deleteAccount,
  getUserAccountRole,
  userHasAccountRole,
  setPrimaryAccount,
  ensureUserHasAccount,
  type UserAccount,
  type CreateAccountInput,
  type UpdateAccountInput,
} from './accounts'

// Members (rename AccountMember to avoid conflict)
export {
  fetchAccountMembers,
  updateMemberRole,
  removeMember,
  leaveAccount,
  inviteMember,
  fetchAccountInvitations,
  acceptInvitation,
  cancelInvitation,
  resendInvitation,
  type AccountMember as MemberInfo,
  type AccountInvitation,
  type InviteMemberInput,
  type MemberRole,
} from './members'

// Tools
export * from './tools'

// OAuth
export * from './oauth'
