// Vercel Serverless Function: Google Drive proxy
// Keeps service account credentials server-side (never exposed to browser)
// Client calls this route instead of Google Drive API directly

import type { VercelRequest, VercelResponse } from '@vercel/node'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const SHARED_DRIVE_PARAMS = 'includeItemsFromAllDrives=true&supportsAllDrives=true'

// Server-side only env vars (no VITE_ prefix)
const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || ''
const SERVICE_ACCOUNT_KEY_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || ''

// ─── Types ───────────────────────────────────────────────────────────────────

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
  expiresAt: number
}

let cachedToken: TokenCache | null = null

// ─── Auth ────────────────────────────────────────────────────────────────────

function getServiceAccountKey(): ServiceAccountKey | null {
  if (!SERVICE_ACCOUNT_KEY_JSON) return null
  try {
    return JSON.parse(SERVICE_ACCOUNT_KEY_JSON)
  } catch {
    console.error('[DriveProxy] Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY')
    return null
  }
}

async function getAccessToken(): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cachedToken.accessToken
  }

  const key = getServiceAccountKey()
  if (!key) return null

  try {
    const jwt = await createSignedJwt(key)
    return await exchangeJwtForToken(jwt, key.token_uri)
  } catch (err) {
    console.error('[DriveProxy] Auth failed:', err)
    return null
  }
}

async function createSignedJwt(key: ServiceAccountKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: key.token_uri,
    iat: now,
    exp: now + 3600,
  }

  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const signingInput = `${encodedHeader}.${encodedPayload}`

  const privateKey = await importPrivateKey(key.private_key)
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    privateKey,
    new TextEncoder().encode(signingInput)
  )

  return `${signingInput}.${base64UrlEncode(signature)}`
}

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
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  }
  return data.access_token
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/-----BEGIN RSA PRIVATE KEY-----/g, '')
    .replace(/-----END RSA PRIVATE KEY-----/g, '')
    .replace(/\s/g, '')

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

// ─── Auth headers helper ─────────────────────────────────────────────────────

async function authHeaders(): Promise<Record<string, string> | null> {
  const token = await getAccessToken()
  if (!token) return null
  return { Authorization: `Bearer ${token}` }
}

// ─── Drive query escaping ────────────────────────────────────────────────────

function escapeDriveQuery(str: string): string {
  return str.replace(/'/g, "\\'")
}

// ─── Google Docs export types ────────────────────────────────────────────────

const GOOGLE_EXPORT_TYPES: Record<string, { mime: string }> = {
  'application/vnd.google-apps.document': { mime: 'text/plain' },
  'application/vnd.google-apps.spreadsheet': { mime: 'text/csv' },
  'application/vnd.google-apps.presentation': { mime: 'text/plain' },
}

// ─── Root folder containment check ──────────────────────────────────────────

async function isWithinRootFolder(
  fileId: string,
  headers: Record<string, string>,
  maxDepth = 10
): Promise<boolean> {
  if (!ROOT_FOLDER_ID) return true
  let currentId = fileId
  for (let i = 0; i < maxDepth; i++) {
    if (currentId === ROOT_FOLDER_ID) return true
    const res = await fetch(
      `${DRIVE_API}/files/${currentId}?fields=parents&${SHARED_DRIVE_PARAMS}`,
      { headers }
    )
    if (!res.ok) return false
    const data = await res.json()
    if (!data.parents || data.parents.length === 0) return false
    currentId = data.parents[0]
  }
  return false
}

// ─── Drive Operations ────────────────────────────────────────────────────────

async function fetchFile(fileId: string, headers: Record<string, string>) {
  const metaRes = await fetch(
    `${DRIVE_API}/files/${fileId}?fields=id,name,mimeType,size,parents&${SHARED_DRIVE_PARAMS}`,
    { headers }
  )
  if (!metaRes.ok) return { success: false, error: `File not found (${metaRes.status})` }

  const meta = await metaRes.json()

  if (ROOT_FOLDER_ID && !(await isWithinRootFolder(fileId, headers))) {
    return { success: false, error: 'File is outside the allowed folder scope' }
  }

  const exportType = GOOGLE_EXPORT_TYPES[meta.mimeType]
  if (exportType) {
    const exportRes = await fetch(
      `${DRIVE_API}/files/${fileId}/export?mimeType=${encodeURIComponent(exportType.mime)}`,
      { headers }
    )
    if (!exportRes.ok) return { success: false, error: `Export failed (${exportRes.status})` }
    const content = await exportRes.text()
    return { success: true, content, mimeType: exportType.mime, fileName: meta.name }
  }

  const dlRes = await fetch(
    `${DRIVE_API}/files/${fileId}?alt=media&${SHARED_DRIVE_PARAMS}`,
    { headers }
  )
  if (!dlRes.ok) return { success: false, error: `Download failed (${dlRes.status})` }

  const contentType = meta.mimeType || ''
  if (contentType.startsWith('text/') || contentType.includes('json') || contentType.includes('markdown')) {
    const content = await dlRes.text()
    return { success: true, content, mimeType: contentType, fileName: meta.name }
  }

  return {
    success: true,
    content: `[Binary file: ${meta.name} (${meta.mimeType}, ${meta.size || 'unknown'} bytes)]`,
    mimeType: contentType,
    fileName: meta.name,
  }
}

async function fetchByPath(path: string, headers: Record<string, string>) {
  const segments = path.split('/').filter(Boolean)
  if (segments.length === 0) return { success: false, error: 'Empty path' }

  let parentId = ROOT_FOLDER_ID || 'root'

  for (let i = 0; i < segments.length - 1; i++) {
    const folderName = segments[i]
    const query = `name='${escapeDriveQuery(folderName)}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
    const res = await fetch(
      `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=1&${SHARED_DRIVE_PARAMS}`,
      { headers }
    )
    if (!res.ok) return { success: false, error: `Folder lookup failed at "${folderName}" (${res.status})` }
    const data = await res.json()
    if (!data.files || data.files.length === 0) {
      return { success: false, error: `Folder not found: "${folderName}" in path "${path}"` }
    }
    parentId = data.files[0].id
  }

  const fileName = segments[segments.length - 1]
  const query = `name='${escapeDriveQuery(fileName)}' and '${parentId}' in parents and trashed=false`
  const res = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType)&pageSize=1&${SHARED_DRIVE_PARAMS}`,
    { headers }
  )
  if (!res.ok) return { success: false, error: `File lookup failed (${res.status})` }
  const data = await res.json()
  if (!data.files || data.files.length === 0) {
    return { success: false, error: `File not found: "${fileName}" in path "${path}"` }
  }

  return fetchFile(data.files[0].id, headers)
}

async function listFolder(folderId: string | undefined, headers: Record<string, string>) {
  const targetFolder = folderId || ROOT_FOLDER_ID || 'root'
  const query = `'${targetFolder}' in parents and trashed=false`

  let driveParams = SHARED_DRIVE_PARAMS
  if (ROOT_FOLDER_ID && targetFolder === ROOT_FOLDER_ID) {
    driveParams += `&corpora=drive&driveId=${ROOT_FOLDER_ID}`
  }

  const res = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)&orderBy=folder,name&pageSize=100&${driveParams}`,
    { headers }
  )
  if (!res.ok) return { success: false, error: `List failed (${res.status})` }
  const data = await res.json()
  return { success: true, files: data.files || [] }
}

async function searchFiles(searchQuery: string, headers: Record<string, string>) {
  const driveQuery = `fullText contains '${escapeDriveQuery(searchQuery)}' and trashed=false`

  let driveParams = SHARED_DRIVE_PARAMS
  if (ROOT_FOLDER_ID) {
    driveParams += `&corpora=drive&driveId=${ROOT_FOLDER_ID}`
  }

  const res = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(driveQuery)}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)&pageSize=20&${driveParams}`,
    { headers }
  )
  if (!res.ok) return { success: false, error: `Search failed (${res.status})` }
  const data = await res.json()
  return { success: true, files: data.files || [] }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const headers = await authHeaders()
  if (!headers) {
    return res.status(500).json({
      success: false,
      error: 'Google Drive not configured — missing service account key',
    })
  }

  const { action, file_id, path, query, folder_id } = req.body || {}

  try {
    switch (action) {
      case 'fetch': {
        if (!file_id) return res.status(400).json({ success: false, error: 'file_id required' })
        const result = await fetchFile(file_id, headers)
        return res.status(result.success ? 200 : 404).json(result)
      }
      case 'fetch_by_path': {
        if (!path) return res.status(400).json({ success: false, error: 'path required' })
        const result = await fetchByPath(path, headers)
        return res.status(result.success ? 200 : 404).json(result)
      }
      case 'list': {
        const result = await listFolder(folder_id, headers)
        return res.status(result.success ? 200 : 500).json(result)
      }
      case 'search': {
        if (!query) return res.status(400).json({ success: false, error: 'query required' })
        const result = await searchFiles(query, headers)
        return res.status(result.success ? 200 : 500).json(result)
      }
      case 'test': {
        const result = await listFolder(undefined, headers)
        return res.json({
          success: result.success,
          fileCount: result.success ? (result as { files: unknown[] }).files.length : 0,
          error: result.success ? undefined : (result as { error: string }).error,
        })
      }
      default:
        return res.status(400).json({ success: false, error: 'Invalid action. Use: fetch, fetch_by_path, list, search, test' })
    }
  } catch (err) {
    console.error('[DriveProxy] Error:', err)
    return res.status(500).json({
      success: false,
      error: `Drive proxy error: ${err instanceof Error ? err.message : 'Unknown error'}`,
    })
  }
}
