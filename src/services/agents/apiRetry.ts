// API Retry Utility - Handles rate limiting with exponential backoff

export interface RetryConfig {
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
}

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
}

// Sleep for a given number of milliseconds
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Calculate exponential backoff delay with jitter
function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt)
  const jitter = Math.random() * 1000 // Add up to 1 second of random jitter
  return Math.min(exponentialDelay + jitter, config.maxDelayMs)
}

// Fetch with retry on 429 (rate limit) errors
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  config: RetryConfig = DEFAULT_CONFIG
): Promise<Response> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const response = await fetch(url, options)

      // If rate limited, retry with backoff
      if (response.status === 429) {
        if (attempt < config.maxRetries) {
          const delay = calculateDelay(attempt, config)
          console.log(`[API Retry] Rate limited (429). Retrying in ${Math.round(delay / 1000)}s... (attempt ${attempt + 1}/${config.maxRetries})`)
          await sleep(delay)
          continue
        }
        // Max retries exceeded
        console.error(`[API Retry] Max retries exceeded for rate limiting`)
      }

      // For other errors or success, return the response
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

// Wrapper specifically for Anthropic API calls
export async function anthropicFetchWithRetry(
  body: object,
  config: RetryConfig = DEFAULT_CONFIG
): Promise<Response> {
  const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY as string

  if (!ANTHROPIC_API_KEY) {
    throw new Error('Anthropic API key not configured')
  }

  return fetchWithRetry(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    },
    config
  )
}
