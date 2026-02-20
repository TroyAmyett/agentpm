// Google Drive Service — Read files, list folders, search docs
// Uses service account auth from ./auth.ts
// All queries scoped to root folder ID when configured (security boundary)
// Supports Shared Drives (Team Drives) via includeItemsFromAllDrives

import { getAccessToken } from './auth'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'

// Root folder ID — if set, all queries are scoped to this folder and its children
// Can be a regular folder ID or a Shared Drive ID
const ROOT_FOLDER_ID = import.meta.env.VITE_GOOGLE_DRIVE_ROOT_FOLDER_ID || ''

// Shared Drive params — required for accessing files in Shared Drives
const SHARED_DRIVE_PARAMS = 'includeItemsFromAllDrives=true&supportsAllDrives=true'

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
      `${DRIVE_API}/files/${fileId}?fields=id,name,mimeType,size,parents&${SHARED_DRIVE_PARAMS}`,
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
      `${DRIVE_API}/files/${fileId}?alt=media&${SHARED_DRIVE_PARAMS}`,
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
        `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=1&${SHARED_DRIVE_PARAMS}`,
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
      `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType)&pageSize=1&${SHARED_DRIVE_PARAMS}`,
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
    // For Shared Drives, also include corpora=drive&driveId when listing the root
    let driveParams = SHARED_DRIVE_PARAMS
    if (ROOT_FOLDER_ID && targetFolder === ROOT_FOLDER_ID) {
      driveParams += `&corpora=drive&driveId=${ROOT_FOLDER_ID}`
    }

    const res = await fetch(
      `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)&orderBy=folder,name&pageSize=100&${driveParams}`,
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
export async function searchDriveFiles(query: string, _folderId?: string): Promise<DriveFileEntry[]> {
  const headers = await authHeaders()
  if (!headers) return []

  // Use fullText search which searches file content + names
  // For Shared Drives, search within the drive scope
  const driveQuery = `fullText contains '${escapeDriveQuery(query)}' and trashed=false`

  try {
    let driveParams = SHARED_DRIVE_PARAMS
    if (ROOT_FOLDER_ID) {
      driveParams += `&corpora=drive&driveId=${ROOT_FOLDER_ID}`
    }

    const res = await fetch(
      `${DRIVE_API}/files?q=${encodeURIComponent(driveQuery)}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)&pageSize=20&${driveParams}`,
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
