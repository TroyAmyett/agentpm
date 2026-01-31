// LLM Model Catalog - Centralized model configuration
// Maps use cases to provider-specific model IDs

import type { LLMProvider } from './types'

// Known model catalog - maps tier names to provider-specific IDs
export const MODEL_CATALOG: Record<string, Partial<Record<LLMProvider, string>>> = {
  fast: {
    anthropic: 'claude-sonnet-4-20250514',
    openai: 'gpt-4o-mini',
    google: 'gemini-2.0-flash',
    groq: 'llama-3.1-70b-versatile',
    mistral: 'mistral-large-latest',
  },
  smart: {
    anthropic: 'claude-sonnet-4-20250514',
    openai: 'gpt-4o',
    google: 'gemini-2.5-pro',
    groq: 'llama-3.1-70b-versatile',
    mistral: 'mistral-large-latest',
  },
}

// Use case -> model tier mapping
export const USE_CASE_MODELS: Record<string, keyof typeof MODEL_CATALOG> = {
  'task-routing': 'fast',
  'task-execution': 'smart',
  'chat-assistant': 'fast',
  'brand-extraction': 'fast',
  'decomposition': 'fast',
}

/**
 * Resolve the model ID for a given provider and use case
 */
export function resolveModelId(provider: LLMProvider, useCase: string): string {
  const tier = USE_CASE_MODELS[useCase] || 'smart'
  const catalog = MODEL_CATALOG[tier]
  return catalog?.[provider] || catalog?.anthropic || 'claude-sonnet-4-20250514'
}

// Token cost per model (USD per token) for cost tracking
export const TOKEN_COSTS: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 3.00 / 1_000_000, output: 15.00 / 1_000_000 },
  'gpt-4o': { input: 2.50 / 1_000_000, output: 10.00 / 1_000_000 },
  'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
  'gemini-2.0-flash': { input: 0.10 / 1_000_000, output: 0.40 / 1_000_000 },
  'gemini-2.5-pro': { input: 1.25 / 1_000_000, output: 10.00 / 1_000_000 },
  'llama-3.1-70b-versatile': { input: 0.59 / 1_000_000, output: 0.79 / 1_000_000 },
  'mistral-large-latest': { input: 2.00 / 1_000_000, output: 6.00 / 1_000_000 },
}

/**
 * Calculate cost in cents for a given model and token usage
 */
export function calculateCostCents(model: string, inputTokens: number, outputTokens: number): number {
  const costs = TOKEN_COSTS[model] || { input: 3.00 / 1_000_000, output: 15.00 / 1_000_000 }
  return Math.ceil((inputTokens * costs.input + outputTokens * costs.output) * 100)
}
