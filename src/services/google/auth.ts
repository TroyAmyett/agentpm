// Google Service Account Authentication
// Uses JWT assertion to get OAuth2 access tokens — no npm dependencies needed
// Tokens are cached in memory and auto-refreshed (1 hour TTL)

interface ServiceAccountKey {
  type: string
  project_id: string
  private_key_id: string
  private_key: string
  client_email: string
  client_id: string
  auth_uri: string
  token_uri: string
}

interface TokenCache {
  accessToken: string
  expiresAt: number // Unix timestamp ms
}

let cachedToken: TokenCache | null = null

/**
 * Parse the service account JSON key from environment
 * Expects GOOGLE_SERVICE_ACCOUNT_KEY env var with the full JSON string
 */
export function getServiceAccountKey(): ServiceAccountKey | null {
  const keyJson = import.meta.env.VITE_GOOGLE_SERVICE_ACCOUNT_KEY
  if (!keyJson) return null

  try {
    return JSON.parse(keyJson) as ServiceAccountKey
  } catch {
    console.error('Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY')
    return null
  }
}

/**
 * Create a JWT and exchange it for an OAuth2 access token
 * Scoped to Google Drive read-only
 */
export async function getAccessToken(): Promise<string | null> {
  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cachedToken.accessToken
  }

  const key = getServiceAccountKey()
  if (!key) return null

  try {
    const jwt = await createSignedJwt(key)
    const token = await exchangeJwtForToken(jwt, key.token_uri)
    return token
  } catch (err) {
    console.error('Google auth failed:', err)
    return null
  }
}

/**
 * Create a signed JWT for Google's OAuth2 token endpoint
 */
async function createSignedJwt(key: ServiceAccountKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000)

  const header = {
    alg: 'RS256',
    typ: 'JWT',
  }

  const payload = {
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: key.token_uri,
    iat: now,
    exp: now + 3600, // 1 hour
  }

  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const signingInput = `${encodedHeader}.${encodedPayload}`

  // Import the RSA private key
  const privateKey = await importPrivateKey(key.private_key)

  // Sign with RS256
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    privateKey,
    new TextEncoder().encode(signingInput)
  )

  const encodedSignature = base64UrlEncode(signature)
  return `${signingInput}.${encodedSignature}`
}

/**
 * Exchange a signed JWT for an access token
 */
async function exchangeJwtForToken(jwt: string, tokenUri: string): Promise<string> {
  const response = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Token exchange failed (${response.status}): ${text}`)
  }

  const data = await response.json()

  // Cache the token
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  }

  return data.access_token
}

/**
 * Import a PEM-encoded RSA private key for use with Web Crypto API
 */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  // Strip PEM headers and whitespace
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/-----BEGIN RSA PRIVATE KEY-----/g, '')
    .replace(/-----END RSA PRIVATE KEY-----/g, '')
    .replace(/\s/g, '')

  // Decode base64 to ArrayBuffer
  const binaryString = atob(pemBody)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }

  return crypto.subtle.importKey(
    'pkcs8',
    bytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
}

/**
 * Base64url encode a string or ArrayBuffer
 */
function base64UrlEncode(input: string | ArrayBuffer): string {
  let base64: string
  if (typeof input === 'string') {
    base64 = btoa(input)
  } else {
    const bytes = new Uint8Array(input)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    base64 = btoa(binary)
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Clear the cached token (useful for testing or after errors)
 */
export function clearTokenCache(): void {
  cachedToken = null
}
