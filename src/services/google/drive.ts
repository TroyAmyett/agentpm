// Google Drive Service — Client-side proxy to server-side Drive API
// All actual Google API calls happen in api/drive-proxy.ts (Vercel serverless)
// This keeps the service account key server-side only (never in browser bundle)

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

// ─── Proxy helper ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function driveProxy(body: Record<string, unknown>): Promise<any> {
  const res = await fetch('/api/drive-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

// ─── File Operations ────────────────────────────────────────────────────────

/**
 * Fetch a file's content by its Drive file ID
 * Handles Google Docs (export as text), PDFs, and regular files
 */
export async function fetchDriveFile(fileId: string): Promise<DriveFileResult> {
  try {
    const result = await driveProxy({ action: 'fetch', file_id: fileId })
    return result as DriveFileResult
  } catch (err) {
    return { success: false, error: `Drive proxy error: ${err instanceof Error ? err.message : 'Unknown error'}` }
  }
}

/**
 * Navigate to a file by path relative to root folder
 * e.g., "skills/marketing/lead-gen.md" navigates folder by folder
 */
export async function fetchDriveFileByPath(path: string): Promise<DriveFileResult> {
  try {
    const result = await driveProxy({ action: 'fetch_by_path', path })
    return result as DriveFileResult
  } catch (err) {
    return { success: false, error: `Drive proxy error: ${err instanceof Error ? err.message : 'Unknown error'}` }
  }
}

/**
 * List contents of a folder
 */
export async function listDriveFolder(folderId?: string): Promise<DriveFileEntry[]> {
  try {
    const result = await driveProxy({ action: 'list', folder_id: folderId })
    if (result.success && Array.isArray(result.files)) {
      return result.files as DriveFileEntry[]
    }
    return []
  } catch {
    return []
  }
}

/**
 * Search for files by name or content within the root folder scope
 */
export async function searchDriveFiles(query: string): Promise<DriveFileEntry[]> {
  try {
    const result = await driveProxy({ action: 'search', query })
    if (result.success && Array.isArray(result.files)) {
      return result.files as DriveFileEntry[]
    }
    return []
  } catch {
    return []
  }
}

/**
 * Test connectivity to Google Drive
 */
export async function testDriveConnection(): Promise<{ success: boolean; fileCount?: number; error?: string }> {
  try {
    const result = await driveProxy({ action: 'test' })
    return result as { success: boolean; fileCount?: number; error?: string }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
