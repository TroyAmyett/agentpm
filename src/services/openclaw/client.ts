// OpenClaw Client — HTTP client for communicating with an OpenClaw runtime
// OpenClaw is a self-hosted AI agent gateway running on a VPS behind Tailscale

export interface OpenClawResponse {
  success: boolean
  sessionId?: string
  response?: string
  error?: string
}

export interface OpenClawStatus {
  online: boolean
  version?: string
  uptime?: number
  activeSessions?: number
}

export class OpenClawClient {
  private runtimeUrl: string
  private authToken: string
  private timeoutMs: number

  constructor(runtimeUrl: string, authToken: string, timeoutMs = 60_000) {
    // Normalize URL — strip trailing slash
    this.runtimeUrl = runtimeUrl.replace(/\/+$/, '')
    this.authToken = authToken
    this.timeoutMs = timeoutMs
  }

  /**
   * Test connectivity to the OpenClaw runtime
   */
  async testConnection(): Promise<boolean> {
    try {
      const res = await fetch(`${this.runtimeUrl}/health`, {
        method: 'GET',
        headers: this.headers(),
        signal: AbortSignal.timeout(10_000),
      })
      return res.ok
    } catch {
      return false
    }
  }

  /**
   * Send a task to an OpenClaw agent via the webhook endpoint
   * POST /hooks/agent
   */
  async sendTask(
    agentName: string,
    message: string,
    context?: Record<string, unknown>
  ): Promise<OpenClawResponse> {
    try {
      const res = await fetch(`${this.runtimeUrl}/hooks/agent`, {
        method: 'POST',
        headers: {
          ...this.headers(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: agentName,
          message,
          ...(context ? { context } : {}),
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => 'Unknown error')
        return { success: false, error: `OpenClaw returned ${res.status}: ${text}` }
      }

      const data = await res.json()
      return {
        success: true,
        sessionId: data.sessionId || data.session_id,
        response: data.response || data.message || JSON.stringify(data),
      }
    } catch (err) {
      return {
        success: false,
        error: `OpenClaw request failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      }
    }
  }

  /**
   * Wake the OpenClaw agent with an event-driven trigger
   * POST /hooks/wake
   */
  async wakeAgent(text: string): Promise<OpenClawResponse> {
    try {
      const res = await fetch(`${this.runtimeUrl}/hooks/wake`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, mode: 'now' }),
        signal: AbortSignal.timeout(this.timeoutMs),
      })

      if (!res.ok) {
        const errText = await res.text().catch(() => 'Unknown error')
        return { success: false, error: `Wake failed (${res.status}): ${errText}` }
      }

      const data = await res.json()
      return { success: true, response: data.response || 'Agent woken' }
    } catch (err) {
      return {
        success: false,
        error: `Wake request failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      }
    }
  }

  /**
   * Get OpenClaw runtime status
   */
  async getStatus(): Promise<OpenClawStatus> {
    try {
      const res = await fetch(`${this.runtimeUrl}/health`, {
        method: 'GET',
        headers: this.headers(),
        signal: AbortSignal.timeout(10_000),
      })

      if (!res.ok) {
        return { online: false }
      }

      const data = await res.json()
      return {
        online: true,
        version: data.version,
        uptime: data.uptime,
        activeSessions: data.activeSessions || data.active_sessions,
      }
    } catch {
      return { online: false }
    }
  }

  private headers(): Record<string, string> {
    return {
      'x-openclaw-token': this.authToken,
    }
  }
}

/**
 * Create an OpenClawClient from intake channel config
 */
export function createClientFromConfig(
  config: Record<string, unknown>
): OpenClawClient | null {
  const runtimeUrl = config.runtime_url as string
  const authToken = config.auth_token as string

  if (!runtimeUrl || !authToken) {
    return null
  }

  const timeout = (config.timeout_ms as number) || 60_000
  return new OpenClawClient(runtimeUrl, authToken, timeout)
}
