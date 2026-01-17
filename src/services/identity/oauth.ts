// Identity Service - OAuth2 Authorization
// Implements OAuth2 Authorization Code flow for SSO

import { supabase } from '../supabase/client'
import { verifyClientCredentials, fetchToolByClientId, type ToolRegistration } from './tools'

// =============================================================================
// HELPER FUNCTIONS
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

/**
 * Generate a secure random string
 */
function generateSecureToken(length = 64): string {
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
 * Hash a string using SHA-256
 */
async function hashString(str: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(str)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

// =============================================================================
// TYPES
// =============================================================================

export interface AuthorizationRequest {
  clientId: string
  redirectUri: string
  responseType: 'code'
  scope?: string
  state?: string
}

export interface TokenRequest {
  grantType: 'authorization_code' | 'refresh_token'
  code?: string
  refreshToken?: string
  clientId: string
  clientSecret: string
  redirectUri?: string
}

export interface TokenResponse {
  accessToken: string
  refreshToken: string
  tokenType: 'Bearer'
  expiresIn: number
  scope: string
}

export interface UserInfo {
  sub: string
  email: string
  name?: string
  accountId?: string
  role?: string
}

export interface OAuthToken {
  id: string
  userId: string
  toolId: string
  scopes: string[]
  expiresAt: string
  createdAt: string
  lastUsedAt?: string
}

// =============================================================================
// AUTHORIZATION CODE FLOW
// =============================================================================

/**
 * Validate and start authorization request
 * Returns the tool info and authorization URL
 */
export async function initiateAuthorization(
  request: AuthorizationRequest
): Promise<{ tool: ToolRegistration; authorizationUrl: string }> {
  if (!supabase) throw new Error('Supabase not configured')

  // Validate client_id
  const tool = await fetchToolByClientId(request.clientId)
  if (!tool) {
    throw new Error('Invalid client_id')
  }

  // Validate redirect_uri
  if (!request.redirectUri.startsWith(tool.callbackUrl)) {
    throw new Error('Invalid redirect_uri')
  }

  // Validate response_type
  if (request.responseType !== 'code') {
    throw new Error('Unsupported response_type. Only "code" is supported.')
  }

  // Build authorization URL (internal consent page)
  const params = new URLSearchParams({
    client_id: request.clientId,
    redirect_uri: request.redirectUri,
    response_type: request.responseType,
    scope: request.scope || '',
    state: request.state || '',
  })

  const authorizationUrl = `/oauth/authorize?${params.toString()}`

  return { tool, authorizationUrl }
}

/**
 * Create authorization code after user consents
 */
export async function createAuthorizationCode(
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state?: string
): Promise<string> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('Not authenticated')

  // Validate client_id
  const tool = await fetchToolByClientId(clientId)
  if (!tool) {
    throw new Error('Invalid client_id')
  }

  // Generate authorization code
  const code = generateSecureToken(48)
  const expiresAt = new Date()
  expiresAt.setMinutes(expiresAt.getMinutes() + 10) // 10 minute expiry

  const { error } = await supabase
    .from('oauth_authorization_codes')
    .insert({
      code,
      user_id: userData.user.id,
      tool_id: tool.id,
      redirect_uri: redirectUri,
      scopes,
      state,
      expires_at: expiresAt.toISOString(),
    })

  if (error) throw error

  return code
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  request: TokenRequest
): Promise<TokenResponse> {
  if (!supabase) throw new Error('Supabase not configured')

  if (request.grantType !== 'authorization_code') {
    throw new Error('Unsupported grant_type for code exchange')
  }

  if (!request.code) {
    throw new Error('Missing authorization code')
  }

  // Verify client credentials
  const tool = await verifyClientCredentials(request.clientId, request.clientSecret)
  if (!tool) {
    throw new Error('Invalid client credentials')
  }

  // Find and validate authorization code
  const { data: authCode, error: codeError } = await supabase
    .from('oauth_authorization_codes')
    .select('*')
    .eq('code', request.code)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (codeError || !authCode) {
    throw new Error('Invalid or expired authorization code')
  }

  // Validate redirect_uri matches
  if (request.redirectUri && authCode.redirect_uri !== request.redirectUri) {
    throw new Error('redirect_uri mismatch')
  }

  // Validate tool matches
  if (authCode.tool_id !== tool.id) {
    throw new Error('Authorization code was issued to a different client')
  }

  // Mark code as used
  await supabase
    .from('oauth_authorization_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('id', authCode.id)

  // Generate tokens
  const accessToken = `flt_at_${generateSecureToken(64)}`
  const refreshToken = `flt_rt_${generateSecureToken(64)}`

  const accessTokenHash = await hashString(accessToken)
  const refreshTokenHash = await hashString(refreshToken)

  // Token expiry
  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + 1) // 1 hour access token

  // Delete any existing tokens for this user/tool combo
  await supabase
    .from('oauth_tokens')
    .delete()
    .eq('user_id', authCode.user_id)
    .eq('tool_id', tool.id)

  // Store tokens
  const { error: tokenError } = await supabase
    .from('oauth_tokens')
    .insert({
      user_id: authCode.user_id,
      tool_id: tool.id,
      access_token_hash: accessTokenHash,
      refresh_token_hash: refreshTokenHash,
      scopes: authCode.scopes,
      expires_at: expiresAt.toISOString(),
    })

  if (tokenError) throw tokenError

  return {
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: 3600, // 1 hour
    scope: (authCode.scopes || []).join(' '),
  }
}

/**
 * Refresh access token
 */
export async function refreshAccessToken(
  request: TokenRequest
): Promise<TokenResponse> {
  if (!supabase) throw new Error('Supabase not configured')

  if (request.grantType !== 'refresh_token') {
    throw new Error('Unsupported grant_type for refresh')
  }

  if (!request.refreshToken) {
    throw new Error('Missing refresh_token')
  }

  // Verify client credentials
  const tool = await verifyClientCredentials(request.clientId, request.clientSecret)
  if (!tool) {
    throw new Error('Invalid client credentials')
  }

  // Hash the refresh token to find it
  const refreshTokenHash = await hashString(request.refreshToken)

  // Find the token
  const { data: existingToken, error: tokenError } = await supabase
    .from('oauth_tokens')
    .select('*')
    .eq('tool_id', tool.id)
    .eq('refresh_token_hash', refreshTokenHash)
    .single()

  if (tokenError || !existingToken) {
    throw new Error('Invalid refresh token')
  }

  // Generate new access token
  const accessToken = `flt_at_${generateSecureToken(64)}`
  const accessTokenHash = await hashString(accessToken)

  // New expiry
  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + 1)

  // Update token
  const { error: updateError } = await supabase
    .from('oauth_tokens')
    .update({
      access_token_hash: accessTokenHash,
      expires_at: expiresAt.toISOString(),
      last_used_at: new Date().toISOString(),
    })
    .eq('id', existingToken.id)

  if (updateError) throw updateError

  return {
    accessToken,
    refreshToken: request.refreshToken, // Keep same refresh token
    tokenType: 'Bearer',
    expiresIn: 3600,
    scope: (existingToken.scopes || []).join(' '),
  }
}

/**
 * Validate access token and return user info
 */
export async function validateAccessToken(accessToken: string): Promise<UserInfo | null> {
  if (!supabase) throw new Error('Supabase not configured')

  // Hash the token to find it
  const accessTokenHash = await hashString(accessToken)

  // Find the token
  const { data: token, error: tokenError } = await supabase
    .from('oauth_tokens')
    .select('*')
    .eq('access_token_hash', accessTokenHash)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (tokenError || !token) {
    return null
  }

  // Update last used
  await supabase
    .from('oauth_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', token.id)

  // Get user info - using admin API would be better here
  // For now, we'll use what we have
  const { data: userData } = await supabase.auth.admin?.getUserById(token.user_id) ||
    { data: null }

  // Get user's primary account
  const { data: userAccount } = await supabase
    .from('user_accounts')
    .select('account_id, role')
    .eq('user_id', token.user_id)
    .eq('is_primary', true)
    .single()

  return {
    sub: token.user_id,
    email: userData?.user?.email || '',
    name: userData?.user?.user_metadata?.full_name,
    accountId: userAccount?.account_id,
    role: userAccount?.role,
  }
}

/**
 * Revoke a token
 */
export async function revokeToken(accessToken: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')

  const accessTokenHash = await hashString(accessToken)

  await supabase
    .from('oauth_tokens')
    .delete()
    .eq('access_token_hash', accessTokenHash)
}

/**
 * Get user's active OAuth sessions
 */
export async function getUserOAuthSessions(): Promise<OAuthToken[]> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('oauth_tokens')
    .select(`
      id,
      user_id,
      tool_id,
      scopes,
      expires_at,
      created_at,
      last_used_at,
      tool_registrations (
        name,
        icon_url
      )
    `)
    .eq('user_id', userData.user.id)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data || []).map((row) => toCamelCaseKeys<OAuthToken>(row))
}

/**
 * Revoke all tokens for a tool (user action)
 */
export async function revokeToolAccess(toolId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('Not authenticated')

  await supabase
    .from('oauth_tokens')
    .delete()
    .eq('user_id', userData.user.id)
    .eq('tool_id', toolId)
}
