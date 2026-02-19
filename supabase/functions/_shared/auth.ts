// Shared API Key Authentication for Supabase Edge Functions
// Used by: intake-task, skills-api, and future external-facing APIs

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface ApiKeyContext {
  accountId: string
  agentType?: string
  agentId?: string
  scopes?: string[]
}

/**
 * Verify an API key from the Authorization header
 * Looks up by key prefix (first 8 chars), checks active + not expired, updates usage stats
 */
export async function verifyApiKey(
  supabase: ReturnType<typeof createClient>,
  authHeader: string | null
): Promise<ApiKeyContext | null> {
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }

  const apiKey = authHeader.replace('Bearer ', '')
  const keyPrefix = apiKey.slice(0, 8)

  const { data, error } = await supabase
    .from('agent_api_keys')
    .select('account_id, agent_type, agent_id, is_active, expires_at, scopes')
    .eq('key_prefix', keyPrefix)
    .eq('is_active', true)
    .single()

  if (error || !data) {
    return null
  }

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return null
  }

  // Update usage stats
  await supabase
    .from('agent_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('key_prefix', keyPrefix)

  return {
    accountId: data.account_id,
    agentType: data.agent_type,
    agentId: data.agent_id,
    scopes: data.scopes,
  }
}

/**
 * Check if an API key context has a specific scope
 */
export function hasScope(ctx: ApiKeyContext, scope: string): boolean {
  if (!ctx.scopes || ctx.scopes.length === 0) {
    return true // No scopes = unrestricted (backward compat)
  }
  return ctx.scopes.includes(scope)
}
