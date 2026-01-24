// Identity Service - Tool Registration
// Admin-only CRUD operations for registered tools

import { supabase } from '../supabase/client'

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

export interface ToolRegistration {
  id: string
  name: string
  description?: string
  baseUrl: string
  callbackUrl: string
  iconUrl?: string
  requiredProviders: string[]
  scopes: string[]
  clientId: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  createdBy?: string
}

export interface CreateToolInput {
  name: string
  description?: string
  baseUrl: string
  callbackUrl: string
  iconUrl?: string
  requiredProviders?: string[]
  scopes?: string[]
}

export interface UpdateToolInput {
  name?: string
  description?: string
  baseUrl?: string
  callbackUrl?: string
  iconUrl?: string
  requiredProviders?: string[]
  scopes?: string[]
  isActive?: boolean
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Generate a UUID v4
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
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
// TOOL REGISTRATION (Admin only)
// =============================================================================

/**
 * Fetch all registered tools
 */
export async function fetchTools(): Promise<ToolRegistration[]> {
  if (!supabase) return [] // Fail gracefully if not configured

  const { data, error } = await supabase
    .from('tool_registrations')
    .select('*')
    .order('name')

  if (error) {
    // Handle auth errors gracefully
    const authErrors = ['JWT expired', 'invalid claim', 'session', 'token', 'unauthorized']
    const isAuthError = authErrors.some(e =>
      error.message?.toLowerCase().includes(e.toLowerCase())
    )

    if (isAuthError) {
      // Try to refresh session
      const { error: refreshError } = await supabase.auth.refreshSession()
      if (refreshError) {
        console.warn('Session expired, please refresh the page or sign in again')
        return []
      }
      // Retry after refresh
      const { data: retryData, error: retryError } = await supabase
        .from('tool_registrations')
        .select('*')
        .order('name')

      if (retryError) return []

      return (retryData || []).map((row) => {
        const tool = toCamelCaseKeys<ToolRegistration>(row)
        return tool
      })
    }

    throw error
  }

  return (data || []).map((row) => {
    const tool = toCamelCaseKeys<ToolRegistration>(row)
    // Never expose client_secret_hash
    return tool
  })
}

/**
 * Fetch a specific tool by ID
 */
export async function fetchTool(toolId: string): Promise<ToolRegistration | null> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('tool_registrations')
    .select('*')
    .eq('id', toolId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }

  return toCamelCaseKeys<ToolRegistration>(data)
}

/**
 * Fetch a tool by client_id
 */
export async function fetchToolByClientId(clientId: string): Promise<ToolRegistration | null> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('tool_registrations')
    .select('*')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }

  return toCamelCaseKeys<ToolRegistration>(data)
}

/**
 * Create a new tool registration
 * Returns the tool with the plain client_secret (show only once!)
 */
export async function createTool(
  input: CreateToolInput
): Promise<ToolRegistration & { clientSecret: string }> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('Not authenticated')

  // Generate credentials
  const clientId = generateUUID()
  const clientSecret = `flt_${generateSecureToken(48)}`
  const clientSecretHash = await hashString(clientSecret)

  const { data, error } = await supabase
    .from('tool_registrations')
    .insert({
      name: input.name,
      description: input.description,
      base_url: input.baseUrl,
      callback_url: input.callbackUrl,
      icon_url: input.iconUrl,
      required_providers: input.requiredProviders || [],
      scopes: input.scopes || [],
      client_id: clientId,
      client_secret_hash: clientSecretHash,
      is_active: true,
      created_by: userData.user.id,
    })
    .select()
    .single()

  if (error) throw error

  const tool = toCamelCaseKeys<ToolRegistration>(data)

  // Return with the plain secret (show only once!)
  return {
    ...tool,
    clientSecret,
  }
}

/**
 * Update a tool registration
 */
export async function updateTool(
  toolId: string,
  updates: UpdateToolInput
): Promise<ToolRegistration> {
  if (!supabase) throw new Error('Supabase not configured')

  const updateData: Record<string, unknown> = {}

  if (updates.name !== undefined) updateData.name = updates.name
  if (updates.description !== undefined) updateData.description = updates.description
  if (updates.baseUrl !== undefined) updateData.base_url = updates.baseUrl
  if (updates.callbackUrl !== undefined) updateData.callback_url = updates.callbackUrl
  if (updates.iconUrl !== undefined) updateData.icon_url = updates.iconUrl
  if (updates.requiredProviders !== undefined) updateData.required_providers = updates.requiredProviders
  if (updates.scopes !== undefined) updateData.scopes = updates.scopes
  if (updates.isActive !== undefined) updateData.is_active = updates.isActive

  const { data, error } = await supabase
    .from('tool_registrations')
    .update(updateData)
    .eq('id', toolId)
    .select()
    .single()

  if (error) throw error

  return toCamelCaseKeys<ToolRegistration>(data)
}

/**
 * Regenerate client secret for a tool
 * Returns the new plain secret (show only once!)
 */
export async function regenerateClientSecret(toolId: string): Promise<string> {
  if (!supabase) throw new Error('Supabase not configured')

  const clientSecret = `flt_${generateSecureToken(48)}`
  const clientSecretHash = await hashString(clientSecret)

  const { error } = await supabase
    .from('tool_registrations')
    .update({ client_secret_hash: clientSecretHash })
    .eq('id', toolId)

  if (error) throw error

  return clientSecret
}

/**
 * Deactivate a tool
 */
export async function deactivateTool(toolId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')

  const { error } = await supabase
    .from('tool_registrations')
    .update({ is_active: false })
    .eq('id', toolId)

  if (error) throw error

  // Also revoke all active tokens for this tool
  await supabase
    .from('oauth_tokens')
    .delete()
    .eq('tool_id', toolId)
}

/**
 * Permanently delete a tool
 */
export async function deleteTool(toolId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured')

  // Delete associated tokens first
  await supabase
    .from('oauth_tokens')
    .delete()
    .eq('tool_id', toolId)

  // Delete authorization codes
  await supabase
    .from('oauth_authorization_codes')
    .delete()
    .eq('tool_id', toolId)

  // Delete the tool
  const { error } = await supabase
    .from('tool_registrations')
    .delete()
    .eq('id', toolId)

  if (error) throw error
}

/**
 * Verify client credentials
 */
export async function verifyClientCredentials(
  clientId: string,
  clientSecret: string
): Promise<ToolRegistration | null> {
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('tool_registrations')
    .select('*')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .single()

  if (error || !data) return null

  // Verify secret
  const secretHash = await hashString(clientSecret)
  if (data.client_secret_hash !== secretHash) {
    return null
  }

  return toCamelCaseKeys<ToolRegistration>(data)
}
