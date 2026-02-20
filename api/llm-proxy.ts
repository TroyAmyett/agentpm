// Vercel Serverless Function: LLM API proxy
// Keeps platform API keys server-side only (never in browser bundle)
// Accepts pre-formatted request bodies from client-side LLM adapters

import type { VercelRequest, VercelResponse } from '@vercel/node'

// Server-side only keys (no VITE_ prefix)
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''

const PROVIDER_CONFIG: Record<string, { url: string; authHeader: (key: string) => Record<string, string> }> = {
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    authHeader: (key) => ({
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    }),
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    authHeader: (key) => ({
      Authorization: `Bearer ${key}`,
    }),
  },
}

function getPlatformKey(provider: string): string {
  switch (provider) {
    case 'anthropic': return ANTHROPIC_API_KEY
    case 'openai': return OPENAI_API_KEY
    default: return ''
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { provider, body } = req.body || {}

  if (!provider || !body) {
    return res.status(400).json({ error: 'Missing provider or body' })
  }

  const config = PROVIDER_CONFIG[provider]
  if (!config) {
    return res.status(400).json({ error: `Unsupported provider: ${provider}` })
  }

  // Resolve the API key
  // Client sends keyRef: 'platform' for platform keys, or the actual key for BYOK
  const keyRef = req.body.keyRef as string
  let apiKey: string

  if (keyRef === 'platform') {
    apiKey = getPlatformKey(provider)
    if (!apiKey) {
      return res.status(500).json({ error: `Platform ${provider} API key not configured on server` })
    }
  } else if (keyRef && !keyRef.startsWith('platform')) {
    // BYOK: client sends the user's own key (they already have it decrypted)
    // This is safe: the key is theirs, and it's encrypted in transit via HTTPS
    apiKey = keyRef
  } else {
    return res.status(400).json({ error: 'Missing keyRef' })
  }

  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...config.authHeader(apiKey),
      },
      body: JSON.stringify(body),
    })

    const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
    return res.status(response.status).json(data)
  } catch (err) {
    console.error(`[LLM Proxy] Error (${provider}):`, err)
    return res.status(502).json({
      error: `LLM proxy failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    })
  }
}
