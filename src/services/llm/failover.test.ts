// LLM Failover Engine — Unit Tests
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { chatWithFailover, buildFailoverChain, getFallbackOrder } from './failover'
import type { LLMConfig, LLMResponse, LLMMessage, LLMChatOptions } from './types'
import * as keyHealth from './keyHealth'

// Mock the LLM adapter creation
vi.mock('./index', () => ({
  createLLMAdapter: vi.fn(),
}))

import { createLLMAdapter } from './index'

const mockCreateLLMAdapter = vi.mocked(createLLMAdapter)

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeConfig(provider: string, keyPrefix: string): LLMConfig {
  return {
    provider: provider as LLMConfig['provider'],
    model: provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o',
    apiKey: `${keyPrefix}-full-key-value-here`,
  }
}

function makeSuccessResponse(model: string): LLMResponse {
  return {
    content: [{ type: 'text', text: 'Hello from ' + model }],
    stopReason: 'end_turn',
    model,
    usage: { inputTokens: 100, outputTokens: 50 },
  }
}

const testMessages: LLMMessage[] = [{ role: 'user', content: 'Hello' }]
const testOptions: LLMChatOptions = { system: 'You are helpful', maxTokens: 100 }

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('failover', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('getFallbackOrder', () => {
    it('returns anthropic first by default', () => {
      const order = getFallbackOrder('unknown-use-case')
      expect(order[0]).toBe('anthropic')
      expect(order).toContain('openai')
    })

    it('returns specific order for task-execution', () => {
      const order = getFallbackOrder('task-execution')
      expect(order).toEqual(['anthropic', 'openai'])
    })
  })

  describe('buildFailoverChain', () => {
    it('builds chain in provider fallback order', () => {
      const keys = [
        { provider: 'openai' as const, apiKey: 'sk-openai-key-12345678' },
        { provider: 'anthropic' as const, apiKey: 'sk-ant-key-12345678' },
      ]

      const chain = buildFailoverChain('task-execution', keys)

      // Anthropic should come first per the fallback order
      expect(chain[0].provider).toBe('anthropic')
      expect(chain[1].provider).toBe('openai')
    })

    it('skips keys that are in cooldown', () => {
      const keys = [
        { provider: 'anthropic' as const, apiKey: 'sk-ant-cool-12345678' },
        { provider: 'openai' as const, apiKey: 'sk-oai-good-12345678' },
      ]

      // Put anthropic key in cooldown
      keyHealth.recordKeyFailure('anthropic', 'sk-ant-cool-12345678', 'rate_limit')

      const chain = buildFailoverChain('task-execution', keys)

      // Should only have OpenAI since Anthropic is cooling
      expect(chain.length).toBe(1)
      expect(chain[0].provider).toBe('openai')
    })

    it('returns empty chain if all keys are cooling', () => {
      const keys = [
        { provider: 'anthropic' as const, apiKey: 'sk-ant-dead-12345678' },
      ]

      keyHealth.recordKeyFailure('anthropic', 'sk-ant-dead-12345678', 'rate_limit')

      const chain = buildFailoverChain('task-execution', keys)
      expect(chain.length).toBe(0)
    })
  })

  describe('chatWithFailover', () => {
    it('succeeds on first provider', async () => {
      const chain = [makeConfig('anthropic', 'sk-ant-ok')]
      const expectedResponse = makeSuccessResponse('claude-sonnet-4-20250514')

      mockCreateLLMAdapter.mockReturnValue({
        provider: 'anthropic',
        chat: vi.fn().mockResolvedValue(expectedResponse),
      })

      const result = await chatWithFailover({ chain }, testMessages, testOptions)

      expect(result.response).toEqual(expectedResponse)
      expect(result.servedBy.provider).toBe('anthropic')
      expect(result.servedBy.attempt).toBe(1)
      expect(result.servedBy.wasFallback).toBe(false)
    })

    it('falls back to second provider when first fails', async () => {
      const chain = [
        makeConfig('anthropic', 'sk-ant-fail'),
        makeConfig('openai', 'sk-oai-ok'),
      ]

      const anthropicAdapter = {
        provider: 'anthropic' as const,
        chat: vi.fn().mockRejectedValue(new Error('Anthropic API error: 500')),
      }
      const openaiAdapter = {
        provider: 'openai' as const,
        chat: vi.fn().mockResolvedValue(makeSuccessResponse('gpt-4o')),
      }

      mockCreateLLMAdapter
        .mockReturnValueOnce(anthropicAdapter)
        .mockReturnValueOnce(openaiAdapter)

      const result = await chatWithFailover({ chain }, testMessages, testOptions)

      expect(result.response.model).toBe('gpt-4o')
      expect(result.servedBy.provider).toBe('openai')
      expect(result.servedBy.attempt).toBe(2)
      expect(result.servedBy.wasFallback).toBe(true)
    })

    it('throws when all providers fail', async () => {
      const chain = [
        makeConfig('anthropic', 'sk-ant-dead2'),
        makeConfig('openai', 'sk-oai-dead2'),
      ]

      mockCreateLLMAdapter.mockReturnValue({
        provider: 'anthropic',
        chat: vi.fn().mockRejectedValue(new Error('API error: 500')),
      })

      await expect(
        chatWithFailover({ chain }, testMessages, testOptions)
      ).rejects.toThrow(/All LLM providers failed/)
    })

    it('throws with descriptive error when chain is empty', async () => {
      await expect(
        chatWithFailover({ chain: [] }, testMessages, testOptions)
      ).rejects.toThrow(/No LLM providers available/)
    })

    it('records key success on successful call', async () => {
      const successSpy = vi.spyOn(keyHealth, 'recordKeySuccess')
      const chain = [makeConfig('anthropic', 'sk-ant-track')]

      mockCreateLLMAdapter.mockReturnValue({
        provider: 'anthropic',
        chat: vi.fn().mockResolvedValue(makeSuccessResponse('claude-sonnet-4-20250514')),
      })

      await chatWithFailover({ chain }, testMessages, testOptions)

      expect(successSpy).toHaveBeenCalledWith('anthropic', expect.stringContaining('sk-ant-track'))
    })

    it('records key failure and classifies error type', async () => {
      const failureSpy = vi.spyOn(keyHealth, 'recordKeyFailure')
      const chain = [
        makeConfig('anthropic', 'sk-ant-429x'),
        makeConfig('openai', 'sk-oai-backup'),
      ]

      mockCreateLLMAdapter
        .mockReturnValueOnce({
          provider: 'anthropic',
          chat: vi.fn().mockRejectedValue(new Error('Anthropic API error: 429')),
        })
        .mockReturnValueOnce({
          provider: 'openai',
          chat: vi.fn().mockResolvedValue(makeSuccessResponse('gpt-4o')),
        })

      await chatWithFailover({ chain }, testMessages, testOptions)

      expect(failureSpy).toHaveBeenCalledWith(
        'anthropic',
        expect.stringContaining('sk-ant-429x'),
        'rate_limit'
      )
    })

    it('handles auth errors by moving to next provider', async () => {
      const chain = [
        makeConfig('anthropic', 'sk-ant-badauth'),
        makeConfig('openai', 'sk-oai-goodkey'),
      ]

      mockCreateLLMAdapter
        .mockReturnValueOnce({
          provider: 'anthropic',
          chat: vi.fn().mockRejectedValue(new Error('Anthropic API error: 401')),
        })
        .mockReturnValueOnce({
          provider: 'openai',
          chat: vi.fn().mockResolvedValue(makeSuccessResponse('gpt-4o')),
        })

      const result = await chatWithFailover({ chain }, testMessages, testOptions)

      expect(result.servedBy.provider).toBe('openai')
      expect(result.servedBy.wasFallback).toBe(true)
    })

    it('respects maxAttempts limit', async () => {
      const chain = [
        makeConfig('anthropic', 'sk-ant-limited1'),
        makeConfig('openai', 'sk-oai-limited1'),
      ]

      mockCreateLLMAdapter.mockReturnValue({
        provider: 'anthropic',
        chat: vi.fn().mockRejectedValue(new Error('API error: 500')),
      })

      await expect(
        chatWithFailover({ chain, maxAttempts: 1 }, testMessages, testOptions)
      ).rejects.toThrow(/All LLM providers failed after 1 attempt/)
    })
  })
})
