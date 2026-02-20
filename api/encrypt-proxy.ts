// Vercel Serverless Function: API key encryption/decryption proxy
// Keeps ENCRYPTION_KEY server-side only — client never sees it
// Used when users save or retrieve their BYOK API keys

import type { VercelRequest, VercelResponse } from '@vercel/node'

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || ''

// ─── Crypto helpers (same algorithm as client-side, now running server-side) ─

function stringToArrayBuffer(str: string): ArrayBuffer {
  const encoder = new TextEncoder()
  const encoded = encoder.encode(str)
  return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength)
}

function arrayBufferToString(buffer: ArrayBuffer): string {
  return new TextDecoder().decode(buffer)
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

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
      salt: stringToArrayBuffer('funnelists-api-key-salt'),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!ENCRYPTION_KEY) {
    return res.status(500).json({ error: 'Encryption key not configured on server' })
  }

  const { action, apiKey, encrypted, iv } = req.body || {}

  try {
    if (action === 'encrypt') {
      if (!apiKey) {
        return res.status(400).json({ error: 'Missing apiKey' })
      }

      const ivBytes = crypto.getRandomValues(new Uint8Array(12))
      const key = await deriveKey(ENCRYPTION_KEY)
      const encryptedData = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: ivBytes },
        key,
        stringToArrayBuffer(apiKey)
      )

      // Generate key hint (first 4 + last 4 chars)
      const hint = apiKey.length < 12
        ? apiKey.substring(0, 2) + '...' + apiKey.substring(apiKey.length - 2)
        : apiKey.substring(0, 4) + '...' + apiKey.substring(apiKey.length - 4)

      return res.json({
        success: true,
        encrypted: arrayBufferToBase64(encryptedData),
        iv: arrayBufferToBase64(ivBytes.buffer.slice(ivBytes.byteOffset, ivBytes.byteOffset + ivBytes.byteLength)),
        hint,
      })
    }

    if (action === 'decrypt') {
      if (!encrypted || !iv) {
        return res.status(400).json({ error: 'Missing encrypted or iv' })
      }

      const key = await deriveKey(ENCRYPTION_KEY)
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToArrayBuffer(iv) },
        key,
        base64ToArrayBuffer(encrypted)
      )

      return res.json({
        success: true,
        apiKey: arrayBufferToString(decrypted),
      })
    }

    return res.status(400).json({ error: 'Invalid action. Use: encrypt or decrypt' })
  } catch (err) {
    console.error('[Encrypt Proxy] Error:', err)
    return res.status(500).json({
      error: `Encryption failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    })
  }
}
