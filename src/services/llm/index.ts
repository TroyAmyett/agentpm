// LLM Service - Provider-agnostic LLM access
// Factory, config resolution, and exports

import type { LLMAdapter, LLMConfig, LLMProvider } from './types'
import { AnthropicAdapter } from './adapters/anthropic'
import { OpenAIAdapter } from './adapters/openai'
import { resolveModelId } from './models'
import { useApiKeysStore } from '@/stores/apiKeysStore'
import { useAccountStore } from '@/stores/accountStore'
import { useProfileStore } from '@/stores/profileStore'

// Re-export types and modules
export * from './types'
export { resolveModelId, calculateCostCents, TOKEN_COSTS } from './models'
export { chatWithFailover, buildFailoverChain, type FailoverResult } from './failover'
export { recordKeyFailure, recordKeySuccess, isKeyCooling, getKeyHealth, getAllKeyHealth } from './keyHealth'

// Platform-funded plans that use the platform's API key
const PLATFORM_FUNDED_PLANS = ['free', 'beta', 'trial', 'demo'] as const

/**
 * Create an LLM adapter for the given config
 */
export function createLLMAdapter(config: LLMConfig): LLMAdapter {
  switch (config.provider) {
    case 'anthropic':
      return new AnthropicAdapter(config)
    case 'openai':
      return new OpenAIAdapter(config)
    // TODO: Add Google, Groq, Mistral adapters
    default:
      throw new Error(`Unsupported LLM provider: ${config.provider}`)
  }
}

/**
 * Get the default LLM provider from environment
 */
export function getDefaultProvider(): LLMProvider {
  const envProvider = import.meta.env.VITE_LLM_PROVIDER as string
  if (envProvider && ['anthropic', 'openai', 'google', 'groq', 'mistral', 'together'].includes(envProvider)) {
    return envProvider as LLMProvider
  }
  return 'anthropic'
}

/**
 * Get the platform API key for the default provider
 */
function getPlatformApiKey(provider: LLMProvider): string | null {
  // Check provider-specific env var first, then generic
  const providerKey = import.meta.env[`VITE_${provider.toUpperCase()}_API_KEY`] as string
  if (providerKey) return providerKey

  // Fallback: check the legacy VITE_ANTHROPIC_API_KEY for backward compat
  if (provider === 'anthropic') {
    return (import.meta.env.VITE_ANTHROPIC_API_KEY as string) || null
  }
  // Fallback: check VITE_OPENAI_API_KEY for OpenAI
  if (provider === 'openai') {
    return (import.meta.env.VITE_OPENAI_API_KEY as string) || null
  }

  return null
}

/**
 * Check if user's plan is platform-funded (uses platform API key)
 */
function isPlatformFundedPlan(): boolean {
  const accountStore = useAccountStore.getState()
  const profileStore = useProfileStore.getState()

  if (profileStore.profile?.isSuperAdmin) return true

  const account = accountStore.currentAccount()
  const plan = account?.plan || 'free'

  if (PLATFORM_FUNDED_PLANS.includes(plan as typeof PLATFORM_FUNDED_PLANS[number])) return true
  if (account?.id?.startsWith('default-') || account?.slug === 'demo') return true

  return false
}

/**
 * Get user's stored API key for a provider
 */
async function getUserApiKey(userId: string, provider: LLMProvider): Promise<string | null> {
  const store = useApiKeysStore.getState()

  if (store.keys.length === 0) {
    await store.fetchKeys(userId)
  }

  // Map our provider names to what the store uses
  const providerMap: Record<LLMProvider, string> = {
    anthropic: 'anthropic',
    openai: 'openai',
    google: 'google',
    groq: 'groq',
    mistral: 'mistral',
    together: 'together',
  }

  const storeProvider = providerMap[provider] || provider
  const key = store.keys.find(k => k.provider === storeProvider && k.isValid)

  if (key) {
    const decrypted = await store.getDecryptedKey(key.id)
    if (decrypted) return decrypted
  }

  return null
}

/**
 * Resolve a complete LLM config for a given use case
 * Handles tier-based API key strategy (platform vs BYOK)
 */
export async function resolveLLMConfig(
  useCase: string,
  userId?: string
): Promise<{ config: LLMConfig; source: 'platform' | 'user'; error?: string } | { config: null; source: 'none'; error: string }> {
  const provider = getDefaultProvider()
  const model = resolveModelId(provider, useCase)

  // Platform-funded: use platform key
  if (isPlatformFundedPlan()) {
    const platformKey = getPlatformApiKey(provider)
    if (platformKey) {
      return {
        config: { provider, model, apiKey: platformKey },
        source: 'platform',
      }
    }
    return {
      config: null,
      source: 'none',
      error: 'Platform API key not configured. Please contact support.',
    }
  }

  // BYOK: use user's stored key
  if (!userId) {
    return {
      config: null,
      source: 'none',
      error: 'User ID required for BYOK tier',
    }
  }

  const userKey = await getUserApiKey(userId, provider)
  if (userKey) {
    return {
      config: { provider, model, apiKey: userKey },
      source: 'user',
    }
  }

  // Try other providers the user might have keys for
  const otherProviders: LLMProvider[] = ['anthropic', 'openai', 'google', 'groq', 'mistral'].filter(p => p !== provider) as LLMProvider[]
  for (const altProvider of otherProviders) {
    const altKey = await getUserApiKey(userId, altProvider)
    if (altKey) {
      const altModel = resolveModelId(altProvider, useCase)
      return {
        config: { provider: altProvider, model: altModel, apiKey: altKey },
        source: 'user',
      }
    }
  }

  const account = useAccountStore.getState().currentAccount()
  const planName = account?.plan || 'your'
  return {
    config: null,
    source: 'none',
    error: `Your ${planName} plan requires you to bring your own API key. Please add an API key in Settings > API Keys.`,
  }
}

/**
 * Resolve a failover chain for a use case — returns all available configs
 * in fallback order, with cooling keys filtered out.
 * Use this with chatWithFailover() for automatic provider cascading.
 */
export async function resolveFailoverChain(
  useCase: string,
  userId?: string
): Promise<{ chain: LLMConfig[]; source: 'platform' | 'user' | 'none'; error?: string }> {
  const availableKeys: Array<{ provider: LLMProvider; apiKey: string }> = []

  if (isPlatformFundedPlan()) {
    // Platform-funded: collect all platform keys
    const providers: LLMProvider[] = ['anthropic', 'openai']
    for (const p of providers) {
      const key = getPlatformApiKey(p)
      if (key) availableKeys.push({ provider: p, apiKey: key })
    }

    if (availableKeys.length === 0) {
      return { chain: [], source: 'none', error: 'Platform API key not configured.' }
    }

    const { buildFailoverChain: buildChain } = await import('./failover')
    return { chain: buildChain(useCase, availableKeys), source: 'platform' }
  }

  // BYOK: collect user's keys across all providers
  if (!userId) {
    return { chain: [], source: 'none', error: 'User ID required for BYOK tier' }
  }

  const providers: LLMProvider[] = ['anthropic', 'openai', 'google', 'groq', 'mistral']
  for (const p of providers) {
    const key = await getUserApiKey(userId, p)
    if (key) availableKeys.push({ provider: p, apiKey: key })
  }

  if (availableKeys.length === 0) {
    const account = useAccountStore.getState().currentAccount()
    const planName = account?.plan || 'your'
    return {
      chain: [],
      source: 'none',
      error: `Your ${planName} plan requires an API key. Please add one in Settings > API Keys.`,
    }
  }

  const { buildFailoverChain: buildChain } = await import('./failover')
  return { chain: buildChain(useCase, availableKeys), source: 'user' }
}

/**
 * Quick check if execution is configured (sync, for UI state)
 */
export function isLLMConfigured(): boolean {
  if (isPlatformFundedPlan()) {
    const provider = getDefaultProvider()
    return !!getPlatformApiKey(provider)
  }
  return true // BYOK tiers check at execution time
}
