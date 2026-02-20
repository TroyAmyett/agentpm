// Key Health Registry — Tracks per-key failure state and cooldown
// When an API key gets rate-limited or errors repeatedly, it enters a cooldown
// period where it's skipped in favor of healthier alternatives.

export interface KeyHealthEntry {
  provider: string
  keyPrefix: string           // First 8 chars for identification
  consecutiveFailures: number
  lastFailureAt: number       // timestamp
  cooldownUntil: number       // timestamp — skip this key until then
  totalFailures: number
  lastErrorType: 'rate_limit' | 'server_error' | 'auth_error' | 'network' | null
}

// Cooldown durations (ms) based on consecutive failures
const COOLDOWN_SCHEDULE = [
  30_000,    // 1st failure: 30 seconds
  60_000,    // 2nd: 1 minute
  120_000,   // 3rd: 2 minutes
  300_000,   // 4th: 5 minutes
  600_000,   // 5th+: 10 minutes (cap)
]

// In-memory registry — lives for the session
const registry = new Map<string, KeyHealthEntry>()

function keyId(provider: string, apiKey: string): string {
  return `${provider}:${apiKey.slice(0, 8)}`
}

/**
 * Record a failure for a key. Increments failure count and sets cooldown.
 */
export function recordKeyFailure(
  provider: string,
  apiKey: string,
  errorType: KeyHealthEntry['lastErrorType']
): void {
  const id = keyId(provider, apiKey)
  const existing = registry.get(id)

  const failures = (existing?.consecutiveFailures || 0) + 1
  const cooldownIdx = Math.min(failures - 1, COOLDOWN_SCHEDULE.length - 1)
  const cooldownMs = COOLDOWN_SCHEDULE[cooldownIdx]

  // Auth errors get a longer cooldown — the key is likely invalid
  const actualCooldown = errorType === 'auth_error' ? Math.max(cooldownMs, 600_000) : cooldownMs

  const now = Date.now()

  registry.set(id, {
    provider,
    keyPrefix: apiKey.slice(0, 8),
    consecutiveFailures: failures,
    lastFailureAt: now,
    cooldownUntil: now + actualCooldown,
    totalFailures: (existing?.totalFailures || 0) + 1,
    lastErrorType: errorType,
  })

  console.log(
    `[KeyHealth] ${provider} key ${apiKey.slice(0, 8)}… failed (${errorType}). ` +
    `Failures: ${failures}. Cooling for ${Math.round(actualCooldown / 1000)}s.`
  )
}

/**
 * Record a success for a key. Resets consecutive failure count.
 */
export function recordKeySuccess(provider: string, apiKey: string): void {
  const id = keyId(provider, apiKey)
  const existing = registry.get(id)

  if (existing && existing.consecutiveFailures > 0) {
    registry.set(id, {
      ...existing,
      consecutiveFailures: 0,
      cooldownUntil: 0,
      lastErrorType: null,
    })
    console.log(`[KeyHealth] ${provider} key ${apiKey.slice(0, 8)}… recovered.`)
  }
}

/**
 * Check if a key is currently in cooldown (should be skipped).
 */
export function isKeyCooling(provider: string, apiKey: string): boolean {
  const id = keyId(provider, apiKey)
  const entry = registry.get(id)
  if (!entry) return false
  return Date.now() < entry.cooldownUntil
}

/**
 * Get health status for a key (for diagnostics/UI).
 */
export function getKeyHealth(provider: string, apiKey: string): KeyHealthEntry | null {
  return registry.get(keyId(provider, apiKey)) || null
}

/**
 * Get all entries (for diagnostics).
 */
export function getAllKeyHealth(): KeyHealthEntry[] {
  return Array.from(registry.values())
}

/**
 * Classify an HTTP status code or error into an error type.
 */
export function classifyError(
  status?: number,
  errorMessage?: string
): KeyHealthEntry['lastErrorType'] {
  if (status === 429) return 'rate_limit'
  if (status === 401 || status === 403) return 'auth_error'
  // HTTP 400 with billing/credit messages = treat as auth error (key is unusable)
  if (status === 400 && errorMessage &&
    (errorMessage.includes('credit balance') || errorMessage.includes('billing') ||
     errorMessage.includes('purchase credits') || errorMessage.includes('Plans & Billing'))) {
    return 'auth_error'
  }
  if (status && status >= 500) return 'server_error'
  if (!status || errorMessage?.includes('fetch') || errorMessage?.includes('network')) {
    return 'network'
  }
  return 'server_error'
}
