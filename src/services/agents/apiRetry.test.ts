// API Retry Utility — Unit Tests
// Verifies that fetchWithRetry handles 429, 500, 502, 503, 529 and network errors
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchWithRetry, type RetryConfig } from './apiRetry'

// Fast config for tests (no real delays)
const FAST_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1,    // 1ms base (effectively instant)
  maxDelayMs: 10,    // 10ms max
}

describe('fetchWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Helper to advance timers while fetch is pending
  async function runWithTimers<T>(promise: Promise<T>): Promise<T> {
    // Keep advancing timers until promise resolves
    let resolved = false
    let result: T
    let error: unknown

    promise
      .then(r => { result = r; resolved = true })
      .catch(e => { error = e; resolved = true })

    while (!resolved) {
      await vi.advanceTimersByTimeAsync(15_000) // Advance past rate limit interval
    }

    if (error) throw error
    return result!
  }

  it('returns response on 200 success', async () => {
    const mockResponse = new Response('ok', { status: 200 })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse)

    const result = await runWithTimers(fetchWithRetry('https://api.example.com', {}, FAST_CONFIG))

    expect(result.status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('retries on 429 rate limit', async () => {
    const rateLimitResponse = new Response('rate limited', { status: 429 })
    const successResponse = new Response('ok', { status: 200 })

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(rateLimitResponse)
      .mockResolvedValueOnce(successResponse)

    const result = await runWithTimers(fetchWithRetry('https://api.example.com', {}, FAST_CONFIG))

    expect(result.status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('retries on 500 server error', async () => {
    const serverError = new Response('internal error', { status: 500 })
    const successResponse = new Response('ok', { status: 200 })

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(serverError)
      .mockResolvedValueOnce(successResponse)

    const result = await runWithTimers(fetchWithRetry('https://api.example.com', {}, FAST_CONFIG))

    expect(result.status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('retries on 502 bad gateway', async () => {
    const badGateway = new Response('bad gateway', { status: 502 })
    const successResponse = new Response('ok', { status: 200 })

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(badGateway)
      .mockResolvedValueOnce(successResponse)

    const result = await runWithTimers(fetchWithRetry('https://api.example.com', {}, FAST_CONFIG))

    expect(result.status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('retries on 503 service unavailable', async () => {
    const unavailable = new Response('unavailable', { status: 503 })
    const successResponse = new Response('ok', { status: 200 })

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(unavailable)
      .mockResolvedValueOnce(successResponse)

    const result = await runWithTimers(fetchWithRetry('https://api.example.com', {}, FAST_CONFIG))

    expect(result.status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('retries on 529 (Anthropic overloaded)', async () => {
    const overloaded = new Response('overloaded', { status: 529 })
    const successResponse = new Response('ok', { status: 200 })

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(overloaded)
      .mockResolvedValueOnce(successResponse)

    const result = await runWithTimers(fetchWithRetry('https://api.example.com', {}, FAST_CONFIG))

    expect(result.status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('does NOT retry on 400 bad request', async () => {
    const badRequest = new Response('bad request', { status: 400 })

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(badRequest)

    const result = await runWithTimers(fetchWithRetry('https://api.example.com', {}, FAST_CONFIG))

    expect(result.status).toBe(400)
    expect(fetch).toHaveBeenCalledTimes(1) // No retry
  })

  it('does NOT retry on 401 unauthorized', async () => {
    const unauthorized = new Response('unauthorized', { status: 401 })

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(unauthorized)

    const result = await runWithTimers(fetchWithRetry('https://api.example.com', {}, FAST_CONFIG))

    expect(result.status).toBe(401)
    expect(fetch).toHaveBeenCalledTimes(1) // No retry
  })

  it('retries on network errors (fetch throws)', async () => {
    const successResponse = new Response('ok', { status: 200 })

    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(successResponse)

    const result = await runWithTimers(fetchWithRetry('https://api.example.com', {}, FAST_CONFIG))

    expect(result.status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('throws after exhausting all retries', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('persistent network error'))

    await expect(
      runWithTimers(fetchWithRetry('https://api.example.com', {}, FAST_CONFIG))
    ).rejects.toThrow('persistent network error')

    expect(fetch).toHaveBeenCalledTimes(4) // 1 initial + 3 retries
  })

  it('returns last error response after max retries on 429', async () => {
    const rateLimitResponse = new Response('rate limited', { status: 429 })

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(rateLimitResponse)

    // After exhausting retries, should return the 429 response
    const result = await runWithTimers(fetchWithRetry('https://api.example.com', {}, FAST_CONFIG))

    expect(result.status).toBe(429)
    expect(fetch).toHaveBeenCalledTimes(4) // 1 initial + 3 retries
  })

  it('respects retry-after header', async () => {
    const headers = new Headers({ 'retry-after': '2' }) // 2 seconds
    const rateLimitResponse = new Response('rate limited', { status: 429, headers })
    const successResponse = new Response('ok', { status: 200 })

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(rateLimitResponse)
      .mockResolvedValueOnce(successResponse)

    const result = await runWithTimers(fetchWithRetry('https://api.example.com', {}, FAST_CONFIG))

    expect(result.status).toBe(200)
  })

  it('handles mixed error types during retries', async () => {
    const error500 = new Response('server error', { status: 500 })
    const error429 = new Response('rate limited', { status: 429 })
    const successResponse = new Response('ok', { status: 200 })

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(error500)    // 1st: server error, retry
      .mockResolvedValueOnce(error429)    // 2nd: rate limited, retry
      .mockResolvedValueOnce(successResponse) // 3rd: success

    const result = await runWithTimers(fetchWithRetry('https://api.example.com', {}, FAST_CONFIG))

    expect(result.status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(3)
  })
})
