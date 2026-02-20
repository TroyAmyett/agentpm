// API Key Encryption Service
// Encryption/decryption happens server-side via api/encrypt-proxy.ts
// Encryption key never leaves the server

// Generate a key hint (first 4 and last 4 characters)
export function generateKeyHint(apiKey: string): string {
  if (apiKey.length < 12) {
    return apiKey.substring(0, 2) + '...' + apiKey.substring(apiKey.length - 2)
  }
  return apiKey.substring(0, 4) + '...' + apiKey.substring(apiKey.length - 4)
}

// Detect provider from API key format
export function detectProvider(apiKey: string): string {
  if (apiKey.startsWith('sk-ant-')) return 'anthropic'
  if (apiKey.startsWith('sk-')) return 'openai'
  if (apiKey.startsWith('AIza')) return 'google'
  if (apiKey.startsWith('gsk_')) return 'groq'
  if (apiKey.startsWith('r8_')) return 'replicate'
  return 'custom'
}

export interface EncryptedKey {
  encrypted: string // base64 encoded encrypted data
  iv: string // base64 encoded initialization vector
  hint: string // key hint for display
}

// Encrypt an API key via server-side proxy
export async function encryptApiKey(apiKey: string, _userSecret?: string): Promise<EncryptedKey> {
  const response = await fetch('/api/encrypt-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'encrypt', apiKey }),
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error || 'Encryption failed')
  }

  const data = await response.json()
  return {
    encrypted: data.encrypted,
    iv: data.iv,
    hint: data.hint,
  }
}

// Decrypt an API key via server-side proxy
export async function decryptApiKey(
  encryptedData: string,
  iv: string,
  _userSecret?: string
): Promise<string> {
  const response = await fetch('/api/encrypt-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'decrypt', encrypted: encryptedData, iv }),
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error || 'Decryption failed')
  }

  const data = await response.json()
  return data.apiKey
}

// Validate API key format (basic validation)
export function validateApiKeyFormat(apiKey: string, provider: string): boolean {
  switch (provider) {
    case 'openai':
      return apiKey.startsWith('sk-') && apiKey.length > 20
    case 'anthropic':
      return apiKey.startsWith('sk-ant-') && apiKey.length > 20
    case 'google':
      return apiKey.startsWith('AIza') && apiKey.length > 30
    case 'groq':
      return apiKey.startsWith('gsk_') && apiKey.length > 20
    case 'replicate':
      return apiKey.startsWith('r8_') && apiKey.length > 20
    default:
      return apiKey.length > 10
  }
}

// Provider display info
export const PROVIDERS = {
  openai: { name: 'OpenAI', placeholder: 'sk-...', icon: '🤖' },
  anthropic: { name: 'Anthropic', placeholder: 'sk-ant-...', icon: '🧠' },
  google: { name: 'Google AI', placeholder: 'AIza...', icon: '🔵' },
  azure: { name: 'Azure OpenAI', placeholder: '', icon: '☁️' },
  cohere: { name: 'Cohere', placeholder: '', icon: '🌊' },
  mistral: { name: 'Mistral', placeholder: '', icon: '🌪️' },
  groq: { name: 'Groq', placeholder: 'gsk_...', icon: '⚡' },
  together: { name: 'Together AI', placeholder: '', icon: '🤝' },
  replicate: { name: 'Replicate', placeholder: 'r8_...', icon: '🔄' },
  custom: { name: 'Custom', placeholder: '', icon: '🔑' },
} as const

export type Provider = keyof typeof PROVIDERS
