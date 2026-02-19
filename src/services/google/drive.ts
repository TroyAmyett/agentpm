// Google Drive Service — Read files, list folders, search docs
// Uses service account auth from ./auth.ts
// All queries scoped to root folder ID when configured (security boundary)

import { getAccessToken } from './auth'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'

// Root folder ID — if set, all queries are scoped to this folder and its children
const ROOT_FOLDER_ID = import.meta.env.VITE_GOOGLE_DRIVE_ROOT_FOLDER_ID || ''

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DriveFileEntry {
  id: string
  name: string
  mimeType: string
  size?: string
  modifiedTime?: string
  parents?: string[]
  webViewLink?: string
}

export interface DriveFileResult {
  success: boolean
  content?: string
  mimeType?: string
  fileName?: string
  error?: string
}

// Google Docs MIME types that need export (not direct download)
const GOOGLE_EXPORT_TYPES: Record<string, { mime: string; ext: string }> = {
  'application/vnd.google-apps.document': { mime: 'text/plain', ext: 'txt' },
  'application/vnd.google-apps.spreadsheet': { mime: 'text/csv', ext: 'csv' },
  'application/vnd.google-apps.presentation': { mime: 'text/plain', ext: 'txt' },
}

// ─── Auth Helper ────────────────────────────────────────────────────────────

async function authHeaders(): Promise<Record<string, string> | null> {
  const token = await getAccessToken()
  if (!token) return null
  return { Authorization: `Bearer ${token}` }
}

// ─── File Operations ────────────────────────────────────────────────────────

/**
 * Fetch a file's content by its Drive file ID
 * Handles Google Docs (export as text), PDFs, and regular files
 */
export async function fetchDriveFile(fileId: string): Promise<DriveFileResult> {
  const headers = await authHeaders()
  if (!headers) {
    return { success: false, error: 'Google Drive not configured — missing service account key' }
  }

  try {
    // Get file metadata first
    const metaRes = await fetch(
      `${DRIVE_API}/files/${fileId}?fields=id,name,mimeType,size,parents`,
      { headers }
    )

    if (!metaRes.ok) {
      return { success: false, error: `File not found (${metaRes.status})` }
    }

    const meta: DriveFileEntry = await metaRes.json()

    // Security: verify file is within root folder if configured
    if (ROOT_FOLDER_ID && !(await isWithinRootFolder(fileId, headers))) {
      return { success: false, error: 'File is outside the allowed folder scope' }
    }

    // Google Docs/Sheets/Slides need export
    const exportType = GOOGLE_EXPORT_TYPES[meta.mimeType]
    if (exportType) {
      const exportRes = await fetch(
        `${DRIVE_API}/files/${fileId}/export?mimeType=${encodeURIComponent(exportType.mime)}`,
        { headers }
      )
      if (!exportRes.ok) {
        return { success: false, error: `Export failed (${exportRes.status})` }
      }
      const content = await exportRes.text()
      return { success: true, content, mimeType: exportType.mime, fileName: meta.name }
    }

    // Regular files — download content
    const dlRes = await fetch(
      `${DRIVE_API}/files/${fileId}?alt=media`,
      { headers }
    )
    if (!dlRes.ok) {
      return { success: false, error: `Download failed (${dlRes.status})` }
    }

    // For text-like files, return as string
    const contentType = meta.mimeType || ''
    if (contentType.startsWith('text/') || contentType.includes('json') || contentType.includes('markdown')) {
      const content = await dlRes.text()
      return { success: true, content, mimeType: contentType, fileName: meta.name }
    }

    // For binary files, return a summary
    return {
      success: true,
      content: `[Binary file: ${meta.name} (${meta.mimeType}, ${meta.size || 'unknown'} bytes)]`,
      mimeType: contentType,
      fileName: meta.name,
    }
  } catch (err) {
    return { success: false, error: `Drive API error: ${err instanceof Error ? err.message : 'Unknown error'}` }
  }
}

/**
 * Navigate to a file by path relative to root folder
 * e.g., "skills/marketing/lead-gen.md" navigates folder by folder
 */
export async function fetchDriveFileByPath(path: string): Promise<DriveFileResult> {
  const headers = await authHeaders()
  if (!headers) {
    return { success: false, error: 'Google Drive not configured — missing service account key' }
  }

  const segments = path.split('/').filter(Boolean)
  if (segments.length === 0) {
    return { success: false, error: 'Empty path' }
  }

  try {
    let parentId = ROOT_FOLDER_ID || 'root'

    // Navigate folder segments (all except last)
    for (let i = 0; i < segments.length - 1; i++) {
      const folderName = segments[i]
      const query = `name='${escapeDriveQuery(folderName)}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`

      const res = await fetch(
        `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=1`,
        { headers }
      )

      if (!res.ok) {
        return { success: false, error: `Folder lookup failed at "${folderName}" (${res.status})` }
      }

      const data = await res.json()
      if (!data.files || data.files.length === 0) {
        return { success: false, error: `Folder not found: "${folderName}" in path "${path}"` }
      }

      parentId = data.files[0].id
    }

    // Find the final file
    const fileName = segments[segments.length - 1]
    const query = `name='${escapeDriveQuery(fileName)}' and '${parentId}' in parents and trashed=false`

    const res = await fetch(
      `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType)&pageSize=1`,
      { headers }
    )

    if (!res.ok) {
      return { success: false, error: `File lookup failed (${res.status})` }
    }

    const data = await res.json()
    if (!data.files || data.files.length === 0) {
      return { success: false, error: `File not found: "${fileName}" in path "${path}"` }
    }

    return fetchDriveFile(data.files[0].id)
  } catch (err) {
    return { success: false, error: `Path navigation error: ${err instanceof Error ? err.message : 'Unknown error'}` }
  }
}

/**
 * List contents of a folder
 */
export async function listDriveFolder(folderId?: string): Promise<DriveFileEntry[]> {
  const headers = await authHeaders()
  if (!headers) return []

  const targetFolder = folderId || ROOT_FOLDER_ID || 'root'
  const query = `'${targetFolder}' in parents and trashed=false`

  try {
    const res = await fetch(
      `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)&orderBy=folder,name&pageSize=100`,
      { headers }
    )

    if (!res.ok) return []

    const data = await res.json()
    return data.files || []
  } catch {
    return []
  }
}

/**
 * Search for files by name or content within the root folder scope
 */
export async function searchDriveFiles(query: string, folderId?: string): Promise<DriveFileEntry[]> {
  const headers = await authHeaders()
  if (!headers) return []

  // Build search query — search in name and fullText
  const parentFilter = folderId || ROOT_FOLDER_ID
    ? ` and '${folderId || ROOT_FOLDER_ID}' in parents`
    : ''

  // Use fullText search which searches file content + names
  const driveQuery = `fullText contains '${escapeDriveQuery(query)}'${parentFilter} and trashed=false`

  try {
    const res = await fetch(
      `${DRIVE_API}/files?q=${encodeURIComponent(driveQuery)}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)&pageSize=20`,
      { headers }
    )

    if (!res.ok) return []

    const data = await res.json()
    return data.files || []
  } catch {
    return []
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Escape single quotes in Drive API queries
 */
function escapeDriveQuery(str: string): string {
  return str.replace(/'/g, "\\'")
}

/**
 * Check if a file is within the root folder hierarchy
 * Walks up parent chain to verify containment
 */
async function isWithinRootFolder(
  fileId: string,
  headers: Record<string, string>,
  maxDepth = 10
): Promise<boolean> {
  if (!ROOT_FOLDER_ID) return true // No restriction if no root folder set

  let currentId = fileId
  for (let i = 0; i < maxDepth; i++) {
    if (currentId === ROOT_FOLDER_ID) return true

    const res = await fetch(
      `${DRIVE_API}/files/${currentId}?fields=parents`,
      { headers }
    )

    if (!res.ok) return false

    const data = await res.json()
    if (!data.parents || data.parents.length === 0) return false

    currentId = data.parents[0]
  }

  return false
}

/**
 * Test connectivity to Google Drive
 */
export async function testDriveConnection(): Promise<{ success: boolean; fileCount?: number; error?: string }> {
  const headers = await authHeaders()
  if (!headers) {
    return { success: false, error: 'Google Drive not configured — missing service account key' }
  }

  try {
    const files = await listDriveFolder()
    return { success: true, fileCount: files.length }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
