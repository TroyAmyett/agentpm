// LLM Failover Engine — Cascades through providers on failure
// When the primary provider fails, automatically tries the next available
// provider/model in the fallback chain. Integrates with key health tracking
// to skip keys that are in cooldown.

import type { LLMConfig, LLMMessage, LLMChatOptions, LLMResponse, LLMProvider } from './types'
import { createLLMAdapter } from './index'
import { resolveModelId } from './models'
import {
  recordKeyFailure,
  recordKeySuccess,
  isKeyCooling,
  classifyError,
} from './keyHealth'

// ─── Failover Config ────────────────────────────────────────────────────────

export interface FailoverConfig {
  /** Ordered list of configs to try. First = primary. */
  chain: LLMConfig[]
  /** Max total attempts across all providers (prevents runaway retries) */
  maxAttempts?: number
}

export interface FailoverResult {
  response: LLMResponse
  /** Which provider actually served the request */
  servedBy: {
    provider: LLMProvider
    model: string
    attempt: number
    wasFallback: boolean
  }
}

// ─── Provider fallback order per use case ────────────────────────────────────

const FALLBACK_ORDER: Record<string, LLMProvider[]> = {
  // For task execution, prefer smarter models
  'task-execution': ['anthropic', 'openai'],
  'planning': ['anthropic', 'openai'],
  // For routing/fast tasks, any provider works
  'task-routing': ['anthropic', 'openai'],
  'chat-assistant': ['anthropic', 'openai'],
  'decomposition': ['anthropic', 'openai'],
  'brand-extraction': ['anthropic', 'openai'],
  // Default
  _default: ['anthropic', 'openai'],
}

/**
 * Get the fallback provider order for a use case
 */
export function getFallbackOrder(useCase: string): LLMProvider[] {
  return FALLBACK_ORDER[useCase] || FALLBACK_ORDER._default
}

/**
 * Build a fallback chain of LLM configs for a use case.
 * Filters out keys that are currently in cooldown.
 */
export function buildFailoverChain(
  useCase: string,
  availableKeys: Array<{ provider: LLMProvider; apiKey: string }>
): LLMConfig[] {
  const order = getFallbackOrder(useCase)
  const chain: LLMConfig[] = []

  for (const provider of order) {
    const keysForProvider = availableKeys.filter(k => k.provider === provider)
    for (const { apiKey } of keysForProvider) {
      // Skip keys in cooldown
      if (isKeyCooling(provider, apiKey)) {
        console.log(`[Failover] Skipping ${provider} key ${apiKey.slice(0, 8)}… (cooling)`)
        continue
      }
      chain.push({
        provider,
        model: resolveModelId(provider, useCase),
        apiKey,
      })
    }
  }

  return chain
}

// ─── Core failover function ──────────────────────────────────────────────────

/**
 * Execute an LLM chat call with automatic failover across providers.
 * Tries each config in the chain. On failure, records key health and moves
 * to the next provider. On success, records recovery.
 */
export async function chatWithFailover(
  failoverConfig: FailoverConfig,
  messages: LLMMessage[],
  options: LLMChatOptions
): Promise<FailoverResult> {
  const { chain, maxAttempts = chain.length } = failoverConfig
  const errors: Array<{ provider: string; model: string; error: string }> = []

  if (chain.length === 0) {
    throw new Error(
      'No LLM providers available. All API keys may be in cooldown or unconfigured. ' +
      'Please check your API keys in Settings.'
    )
  }

  const attemptsToMake = Math.min(maxAttempts, chain.length)

  for (let i = 0; i < attemptsToMake; i++) {
    const config = chain[i]
    const adapter = createLLMAdapter(config)

    try {
      const response = await adapter.chat(messages, options)

      // Success — record recovery and return
      recordKeySuccess(config.provider, config.apiKey)

      return {
        response,
        servedBy: {
          provider: config.provider,
          model: config.model,
          attempt: i + 1,
          wasFallback: i > 0,
        },
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      const errorMsg = error.message

      // Extract HTTP status from error message (adapters format it as "... error: {status}")
      const statusMatch = errorMsg.match(/error:\s*(\d{3})/)
      const status = statusMatch ? parseInt(statusMatch[1], 10) : undefined

      // Classify and record the failure
      const errorType = classifyError(status, errorMsg)
      recordKeyFailure(config.provider, config.apiKey, errorType)

      errors.push({
        provider: config.provider,
        model: config.model,
        error: errorMsg,
      })

      // Auth errors on this key — skip to next provider
      if (errorType === 'auth_error') {
        console.log(`[Failover] ${config.provider} auth failed, trying next provider...`)
        continue
      }

      // Rate limit — the key itself is cooling, try next
      if (errorType === 'rate_limit') {
        console.log(`[Failover] ${config.provider} rate limited, trying next provider...`)
        continue
      }

      // Server error — provider is having issues, try next
      if (errorType === 'server_error') {
        console.log(`[Failover] ${config.provider} server error (${status}), trying next provider...`)
        continue
      }

      // Network error — could be transient, try next
      console.log(`[Failover] ${config.provider} network error, trying next provider...`)
    }
  }

  // All providers failed
  const summary = errors
    .map(e => `${e.provider}/${e.model}: ${e.error}`)
    .join('; ')

  throw new Error(
    `All LLM providers failed after ${errors.length} attempt(s). ` +
    `Errors: ${summary}`
  )
}
