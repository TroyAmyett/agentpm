// API Key Encryption Service
// Uses AES-256-GCM for encrypting user API keys at rest
// Encryption happens client-side before sending to database

// Generate a random encryption key (should be stored securely, e.g., in environment)
// In production, this should be a per-user derived key or use a KMS
const ENCRYPTION_KEY = import.meta.env.VITE_ENCRYPTION_KEY || ''

// Convert string to ArrayBuffer
function stringToArrayBuffer(str: string): ArrayBuffer {
  const encoder = new TextEncoder()
  return encoder.encode(str)
}

// Convert ArrayBuffer to string
function arrayBufferToString(buffer: ArrayBuffer): string {
  const decoder = new TextDecoder()
  return decoder.decode(buffer)
}

// Convert ArrayBuffer to base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

// Convert base64 to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

// Derive encryption key from password/secret
async function deriveKey(secret: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    stringToArrayBuffer(secret),
    'PBKDF2',
    false,
    ['deriveKey']
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: stringToArrayBuffer('funnelists-api-key-salt'), // In production, use unique salt per key
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

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

// Encrypt an API key
export async function encryptApiKey(apiKey: string, userSecret?: string): Promise<EncryptedKey> {
  const secret = userSecret || ENCRYPTION_KEY

  if (!secret) {
    throw new Error('Encryption key not configured. Set VITE_ENCRYPTION_KEY environment variable.')
  }

  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(12))

  // Derive key from secret
  const key = await deriveKey(secret)

  // Encrypt the API key
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    stringToArrayBuffer(apiKey)
  )

  return {
    encrypted: arrayBufferToBase64(encrypted),
    iv: arrayBufferToBase64(iv),
    hint: generateKeyHint(apiKey),
  }
}

// Decrypt an API key
export async function decryptApiKey(
  encryptedData: string,
  iv: string,
  userSecret?: string
): Promise<string> {
  const secret = userSecret || ENCRYPTION_KEY

  if (!secret) {
    throw new Error('Encryption key not configured. Set VITE_ENCRYPTION_KEY environment variable.')
  }

  // Derive key from secret
  const key = await deriveKey(secret)

  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToArrayBuffer(iv) },
    key,
    base64ToArrayBuffer(encryptedData)
  )

  return arrayBufferToString(decrypted)
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
