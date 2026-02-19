// Skill Document Resolver — Auto-fetches Google Drive references in skill content
// Detects Drive doc references and replaces them with fetched content
//
// Supported reference patterns:
//   {{gdoc:FILE_ID}}           → Fetch by Google Drive file ID
//   {{gdrive:path/to/doc.md}}  → Fetch by path relative to SSOT root folder
//   gdrive://path/to/doc.md    → Inline URI reference

import { fetchDriveFile, fetchDriveFileByPath } from '@/services/google/drive'

// Match patterns for Drive references
const GDOC_ID_PATTERN = /\{\{gdoc:([a-zA-Z0-9_-]+)\}\}/g
const GDRIVE_PATH_PATTERN = /\{\{gdrive:([^}]+)\}\}/g
const GDRIVE_URI_PATTERN = /gdrive:\/\/([^\s)]+)/g

/**
 * Resolve all Google Drive document references in skill content
 * Replaces references with fetched content inline
 * Returns the original content unchanged if no references are found or if Drive is not configured
 */
export async function resolveSkillDocs(skillContent: string): Promise<string> {
  if (!skillContent) return skillContent

  // Quick check — skip if no references exist
  if (
    !skillContent.includes('{{gdoc:') &&
    !skillContent.includes('{{gdrive:') &&
    !skillContent.includes('gdrive://')
  ) {
    return skillContent
  }

  let resolved = skillContent

  // ── Resolve {{gdoc:FILE_ID}} references ──
  const gdocMatches = [...resolved.matchAll(GDOC_ID_PATTERN)]
  for (const match of gdocMatches) {
    const fileId = match[1]
    const result = await fetchDriveFile(fileId)
    if (result.success && result.content) {
      resolved = resolved.replace(
        match[0],
        `<!-- Resolved from Google Drive: ${result.fileName} -->\n${result.content}`
      )
    } else {
      resolved = resolved.replace(
        match[0],
        `<!-- Failed to resolve gdoc:${fileId}: ${result.error} -->`
      )
    }
  }

  // ── Resolve {{gdrive:path/to/doc}} references ──
  const gdriveMatches = [...resolved.matchAll(GDRIVE_PATH_PATTERN)]
  for (const match of gdriveMatches) {
    const path = match[1]
    const result = await fetchDriveFileByPath(path)
    if (result.success && result.content) {
      resolved = resolved.replace(
        match[0],
        `<!-- Resolved from Google Drive: ${path} -->\n${result.content}`
      )
    } else {
      resolved = resolved.replace(
        match[0],
        `<!-- Failed to resolve gdrive:${path}: ${result.error} -->`
      )
    }
  }

  // ── Resolve gdrive://path/to/doc inline URIs ──
  const uriMatches = [...resolved.matchAll(GDRIVE_URI_PATTERN)]
  for (const match of uriMatches) {
    const path = match[1]
    const result = await fetchDriveFileByPath(path)
    if (result.success && result.content) {
      resolved = resolved.replace(
        match[0],
        `<!-- Resolved from Google Drive: ${path} -->\n${result.content}`
      )
    } else {
      resolved = resolved.replace(
        match[0],
        `<!-- Failed to resolve gdrive://${path}: ${result.error} -->`
      )
    }
  }

  return resolved
}
