// Google Drive Tool Implementation — Read files from SSOT folder
// Agents use this to access reference documents, skill definitions, guidelines, etc.

import { fetchDriveFile, fetchDriveFileByPath, listDriveFolder, searchDriveFiles } from '@/services/google/drive'
import type { ToolResult } from '../types'

/**
 * Fetch a document from Google Drive SSOT
 * Supports: direct file ID, path navigation, search, and folder listing
 */
export async function fetchGoogleDocTool(params: {
  file_id?: string
  path?: string
  query?: string
  list_folder?: string
}): Promise<ToolResult> {
  const { file_id, path, query, list_folder } = params

  // ── Fetch by file ID ──
  if (file_id) {
    const result = await fetchDriveFile(file_id)
    if (!result.success) {
      return { success: false, error: result.error }
    }
    return {
      success: true,
      data: {
        formatted: `**${result.fileName}** (${result.mimeType})\n\n${result.content}`,
        fileName: result.fileName,
        mimeType: result.mimeType,
        content: result.content,
      },
    }
  }

  // ── Fetch by path ──
  if (path) {
    const result = await fetchDriveFileByPath(path)
    if (!result.success) {
      return { success: false, error: result.error }
    }
    return {
      success: true,
      data: {
        formatted: `**${result.fileName}** (${result.mimeType})\n\n${result.content}`,
        fileName: result.fileName,
        mimeType: result.mimeType,
        content: result.content,
      },
    }
  }

  // ── Search ──
  if (query) {
    const files = await searchDriveFiles(query)
    if (files.length === 0) {
      return {
        success: true,
        data: { formatted: `No files found matching "${query}"`, results: [] },
      }
    }
    const formatted = files
      .map((f, i) => `${i + 1}. **${f.name}** (${f.mimeType}) — ID: \`${f.id}\``)
      .join('\n')
    return {
      success: true,
      data: {
        formatted: `Found ${files.length} file(s) matching "${query}":\n\n${formatted}`,
        results: files.map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType })),
      },
    }
  }

  // ── List folder ──
  if (list_folder !== undefined) {
    const folderId = list_folder || undefined // empty string = root folder
    const files = await listDriveFolder(folderId)
    if (files.length === 0) {
      return {
        success: true,
        data: { formatted: 'Folder is empty or not found', contents: [] },
      }
    }
    const formatted = files
      .map((f) => {
        const isFolder = f.mimeType === 'application/vnd.google-apps.folder'
        const icon = isFolder ? '📁' : '📄'
        return `${icon} **${f.name}** — ${isFolder ? 'folder' : f.mimeType} — ID: \`${f.id}\``
      })
      .join('\n')
    return {
      success: true,
      data: {
        formatted: `Folder contents (${files.length} items):\n\n${formatted}`,
        contents: files.map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType })),
      },
    }
  }

  return {
    success: false,
    error: 'Provide one of: file_id, path, query, or list_folder',
  }
}
