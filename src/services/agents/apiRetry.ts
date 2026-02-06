// API Retry Utility - Handles rate limiting with exponential backoff
// LLM APIs often have rate limits, so we use longer delays with jitter

export interface RetryConfig {
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
}

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 5,        // More retries for rate limits
  baseDelayMs: 15000,   // 15 seconds base (accounts for 5 req/min = 12s minimum)
  maxDelayMs: 120000,   // Up to 2 minutes max wait
}

// Global request queue to prevent simultaneous API calls
let lastRequestTime = 0
const MIN_REQUEST_INTERVAL = 13000 // 13 seconds between requests (5 req/min + buffer)

// Sleep for a given number of milliseconds
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Calculate exponential backoff delay with jitter
function calculateDelay(attempt: number, config: RetryConfig): number {
  // For rate limits, use longer delays
  const exponentialDelay = config.baseDelayMs * Math.pow(1.5, attempt) // Gentler exponential
  const jitter = Math.random() * 3000 // Add up to 3 seconds of random jitter
  return Math.min(exponentialDelay + jitter, config.maxDelayMs)
}

// Wait for rate limit window before making request
async function waitForRateLimit(): Promise<void> {
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest
    console.log(`[API Throttle] Waiting ${Math.round(waitTime / 1000)}s to respect rate limit...`)
    await sleep(waitTime)
  }

  lastRequestTime = Date.now()
}

// Status codes that are retryable (transient server issues)
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 529])

// Fetch with retry on rate limit and transient server errors
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  config: RetryConfig = DEFAULT_CONFIG
): Promise<Response> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      // Wait for rate limit window before making request
      await waitForRateLimit()

      const response = await fetch(url, options)

      // Retry on transient errors (429, 500, 502, 503, 529)
      if (RETRYABLE_STATUS_CODES.has(response.status)) {
        // Parse retry-after header if present (mainly for 429)
        const retryAfter = response.headers.get('retry-after')
        let delay = calculateDelay(attempt, config)

        if (retryAfter) {
          const retryAfterMs = parseInt(retryAfter, 10) * 1000
          if (!isNaN(retryAfterMs)) {
            delay = Math.max(delay, retryAfterMs + 1000) // Add 1s buffer
          }
        }

        // Server errors get shorter delays (usually recover faster)
        if (response.status >= 500) {
          delay = Math.min(delay, 30_000) // Cap server error retries at 30s
        }

        if (attempt < config.maxRetries) {
          console.log(`[API Retry] ${response.status} error. Retrying in ${Math.round(delay / 1000)}s... (attempt ${attempt + 1}/${config.maxRetries})`)
          await sleep(delay)
          continue
        }
        // Max retries exceeded
        console.error(`[API Retry] Max retries exceeded (last status: ${response.status})`)
      }

      // For non-retryable errors or success, return the response
      return response
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // For network errors, also retry
      if (attempt < config.maxRetries) {
        const delay = calculateDelay(attempt, config)
        console.log(`[API Retry] Network error. Retrying in ${Math.round(delay / 1000)}s... (attempt ${attempt + 1}/${config.maxRetries})`)
        await sleep(delay)
        continue
      }
    }
  }

  // If we get here, all retries failed
  throw lastError || new Error('API request failed after max retries')
}

