// Key Health Registry — Unit Tests
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  recordKeyFailure,
  recordKeySuccess,
  isKeyCooling,
  getKeyHealth,
  getAllKeyHealth,
  classifyError,
} from './keyHealth'

// Reset the registry between tests by re-importing fresh module
// Since the registry is module-scoped, we mock time instead

describe('keyHealth', () => {
  beforeEach(() => {
    // Reset key health by recording successes for any keys used
    // (clears consecutive failures and cooldown)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('classifyError', () => {
    it('classifies 429 as rate_limit', () => {
      expect(classifyError(429)).toBe('rate_limit')
    })

    it('classifies 401 as auth_error', () => {
      expect(classifyError(401)).toBe('auth_error')
    })

    it('classifies 403 as auth_error', () => {
      expect(classifyError(403)).toBe('auth_error')
    })

    it('classifies 500 as server_error', () => {
      expect(classifyError(500)).toBe('server_error')
    })

    it('classifies 502 as server_error', () => {
      expect(classifyError(502)).toBe('server_error')
    })

    it('classifies 503 as server_error', () => {
      expect(classifyError(503)).toBe('server_error')
    })

    it('classifies network errors by message', () => {
      expect(classifyError(undefined, 'network error')).toBe('network')
      expect(classifyError(undefined, 'fetch failed')).toBe('network')
    })

    it('defaults to server_error for unknown status', () => {
      expect(classifyError(418)).toBe('server_error')
    })
  })

  describe('recordKeyFailure + isKeyCooling', () => {
    const provider = 'anthropic'

    it('marks key as cooling after first failure', () => {
      const key = 'sk-ant-cool-first-fail-1'
      recordKeyFailure(provider, key, 'rate_limit')
      expect(isKeyCooling(provider, key)).toBe(true)
    })

    it('returns health entry with correct failure count', () => {
      const key = 'sk-ant-health-entry-test'
      recordKeyFailure(provider, key, 'rate_limit')
      const health = getKeyHealth(provider, key)
      expect(health).not.toBeNull()
      expect(health!.consecutiveFailures).toBe(1)
      expect(health!.lastErrorType).toBe('rate_limit')
      expect(health!.provider).toBe('anthropic')
    })

    it('escalates cooldown with consecutive failures', () => {
      const key = 'sk-ant-escalate-test-key'
      // First failure: 30s cooldown
      recordKeyFailure(provider, key, 'server_error')
      const health1 = getKeyHealth(provider, key)
      const cooldown1 = health1!.cooldownUntil - health1!.lastFailureAt

      // Second failure: 60s cooldown
      recordKeyFailure(provider, key, 'server_error')
      const health2 = getKeyHealth(provider, key)
      const cooldown2 = health2!.cooldownUntil - health2!.lastFailureAt

      expect(cooldown2).toBeGreaterThan(cooldown1)
    })

    it('key recovers after cooldown period', () => {
      const key = 'sk-ant-recover-after-cd'
      recordKeyFailure(provider, key, 'rate_limit')
      expect(isKeyCooling(provider, key)).toBe(true)

      // Advance past 30-second cooldown
      vi.advanceTimersByTime(31_000)
      expect(isKeyCooling(provider, key)).toBe(false)
    })

    it('auth errors get minimum 10-minute cooldown', () => {
      const key = 'sk-ant-auth-bad-key-x'
      recordKeyFailure(provider, key, 'auth_error')
      const health = getKeyHealth(provider, key)
      const cooldownMs = health!.cooldownUntil - health!.lastFailureAt
      expect(cooldownMs).toBeGreaterThanOrEqual(600_000) // 10 minutes
    })
  })

  describe('recordKeySuccess', () => {
    const provider = 'openai'

    it('resets consecutive failures after success', () => {
      const key = 'sk-oai-success-reset-1'
      recordKeyFailure(provider, key, 'server_error')
      recordKeyFailure(provider, key, 'server_error')
      expect(isKeyCooling(provider, key)).toBe(true)

      // Advance past cooldown so we can "use" the key again
      vi.advanceTimersByTime(120_000)
      recordKeySuccess(provider, key)

      const health = getKeyHealth(provider, key)
      expect(health!.consecutiveFailures).toBe(0)
      expect(health!.cooldownUntil).toBe(0)
    })

    it('preserves total failure count after recovery', () => {
      const key = 'sk-oai-total-preserve-1'
      recordKeyFailure(provider, key, 'rate_limit')
      recordKeyFailure(provider, key, 'rate_limit')
      vi.advanceTimersByTime(120_000)
      recordKeySuccess(provider, key)

      const health = getKeyHealth(provider, key)
      expect(health!.totalFailures).toBe(2)
      expect(health!.consecutiveFailures).toBe(0)
    })
  })

  describe('getAllKeyHealth', () => {
    it('returns entries for all tracked keys', () => {
      recordKeyFailure('anthropic', 'sk-ant-key-aaa-12345678', 'rate_limit')
      recordKeyFailure('openai', 'sk-oai-key-bbb-12345678', 'server_error')

      const all = getAllKeyHealth()
      expect(all.length).toBeGreaterThanOrEqual(2)

      const providers = all.map(e => e.provider)
      expect(providers).toContain('anthropic')
      expect(providers).toContain('openai')
    })
  })

  describe('isKeyCooling for unknown keys', () => {
    it('returns false for never-seen keys', () => {
      expect(isKeyCooling('anthropic', 'sk-never-seen-key-xyz')).toBe(false)
    })
  })
})
