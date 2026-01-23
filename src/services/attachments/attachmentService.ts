// Attachment Service - Handles file storage and metadata
// Uploads files to Supabase Storage and creates attachment records

import { supabase } from '@/services/supabase/client'
import type { ParsedFile } from '@/services/agents/outputParser'
import { sanitizeFilename } from '@/services/agents/outputParser'

export type EntityType = 'note' | 'task' | 'execution'
export type AttachmentSource = 'user' | 'agent'

export interface Attachment {
  id: string
  accountId: string
  entityType: EntityType
  entityId: string
  fileName: string
  fileType: string
  mimeType: string
  fileSize: number
  storagePath: string
  description?: string
  source: AttachmentSource
  createdAt: string
  createdBy: string
}

export interface UploadResult {
  success: boolean
  attachment?: Attachment
  error?: string
}

// Build storage path: attachments/{account_id}/{entity_type}s/{entity_id}/{filename}
function buildStoragePath(
  accountId: string,
  entityType: EntityType,
  entityId: string,
  fileName: string
): string {
  const safeName = sanitizeFilename(fileName)
  return `${accountId}/${entityType}s/${entityId}/${safeName}`
}

// Upload a single file to storage and create attachment record
export async function uploadAttachment(
  file: File | ParsedFile,
  accountId: string,
  entityType: EntityType,
  entityId: string,
  userId: string,
  source: AttachmentSource = 'user'
): Promise<UploadResult> {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' }
  }

  try {
    // Determine file properties based on input type
    let fileName: string
    let content: Blob
    let mimeType: string
    let fileType: string
    let fileSize: number

    if (file instanceof File) {
      // User upload - File object
      fileName = file.name
      content = file
      mimeType = file.type || 'application/octet-stream'
      fileType = getFileTypeFromMime(mimeType)
      fileSize = file.size
    } else {
      // Agent output - ParsedFile object
      fileName = file.path.split('/').pop() || 'untitled'
      content = new Blob([file.content], { type: file.mimeType })
      mimeType = file.mimeType
      fileType = file.fileType
      fileSize = content.size
    }

    const storagePath = buildStoragePath(accountId, entityType, entityId, fileName)

    // Upload to Storage
    const { error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(storagePath, content, {
        contentType: mimeType,
        upsert: true,  // Overwrite if exists
      })

    if (uploadError) {
      console.error('[Attachment] Upload failed:', uploadError)
      return { success: false, error: uploadError.message }
    }

    // Create attachment record
    const { data: attachmentData, error: insertError } = await supabase
      .from('attachments')
      .insert({
        account_id: accountId,
        entity_type: entityType,
        entity_id: entityId,
        file_name: fileName,
        file_type: fileType,
        mime_type: mimeType,
        file_size: fileSize,
        storage_path: storagePath,
        source,
        created_by: userId,
      })
      .select()
      .single()

    if (insertError) {
      console.error('[Attachment] Record creation failed:', insertError)
      // Try to clean up the uploaded file
      await supabase.storage.from('attachments').remove([storagePath])
      return { success: false, error: insertError.message }
    }

    const attachment: Attachment = {
      id: attachmentData.id,
      accountId: attachmentData.account_id,
      entityType: attachmentData.entity_type,
      entityId: attachmentData.entity_id,
      fileName: attachmentData.file_name,
      fileType: attachmentData.file_type,
      mimeType: attachmentData.mime_type,
      fileSize: attachmentData.file_size,
      storagePath: attachmentData.storage_path,
      description: attachmentData.description,
      source: attachmentData.source,
      createdAt: attachmentData.created_at,
      createdBy: attachmentData.created_by,
    }

    console.log(`[Attachment] Uploaded: ${fileName} (${formatFileSize(fileSize)})`)
    return { success: true, attachment }

  } catch (error) {
    console.error('[Attachment] Unexpected error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    }
  }
}

// Upload multiple files from agent output
export async function uploadAgentOutputFiles(
  files: ParsedFile[],
  accountId: string,
  executionId: string,
  userId: string
): Promise<Attachment[]> {
  const attachments: Attachment[] = []

  for (const file of files) {
    const result = await uploadAttachment(
      file,
      accountId,
      'execution',
      executionId,
      userId,
      'agent'
    )

    if (result.success && result.attachment) {
      attachments.push(result.attachment)
    } else {
      console.warn(`[Attachment] Failed to upload ${file.path}:`, result.error)
    }
  }

  console.log(`[Attachment] Uploaded ${attachments.length}/${files.length} files from agent output`)
  return attachments
}

// Fetch attachments for an entity
export async function fetchAttachments(
  entityType: EntityType,
  entityId: string
): Promise<Attachment[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('attachments')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[Attachment] Fetch failed:', error)
    return []
  }

  return (data || []).map(row => ({
    id: row.id,
    accountId: row.account_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    fileName: row.file_name,
    fileType: row.file_type,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    storagePath: row.storage_path,
    description: row.description,
    source: row.source,
    createdAt: row.created_at,
    createdBy: row.created_by,
  }))
}

// Get download URL for an attachment
export async function getDownloadUrl(attachment: Attachment): Promise<string | null> {
  if (!supabase) return null

  const { data, error } = await supabase.storage
    .from('attachments')
    .createSignedUrl(attachment.storagePath, 3600)  // 1 hour expiry

  if (error) {
    console.error('[Attachment] Failed to get download URL:', error)
    return null
  }

  return data.signedUrl
}

// Download attachment content as text (for preview)
export async function downloadAttachmentText(attachment: Attachment): Promise<string | null> {
  if (!supabase) return null

  const { data, error } = await supabase.storage
    .from('attachments')
    .download(attachment.storagePath)

  if (error) {
    console.error('[Attachment] Download failed:', error)
    return null
  }

  return await data.text()
}

// Delete an attachment (soft delete)
export async function deleteAttachment(attachmentId: string): Promise<boolean> {
  if (!supabase) return false

  const { error } = await supabase
    .from('attachments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', attachmentId)

  if (error) {
    console.error('[Attachment] Delete failed:', error)
    return false
  }

  return true
}

// Helper: Get file type from MIME type
function getFileTypeFromMime(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('text/html')) return 'html'
  if (mimeType.includes('css')) return 'css'
  if (mimeType.includes('javascript')) return 'js'
  if (mimeType.includes('json')) return 'data'
  if (mimeType.includes('markdown')) return 'text'
  if (mimeType.includes('pdf')) return 'pdf'
  if (mimeType.includes('word')) return 'docx'
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'xlsx'
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'pptx'
  return 'other'
}

// Helper: Format file size for display
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Helper: Get file icon based on type
export function getFileIcon(fileType: string): string {
  const icons: Record<string, string> = {
    html: '🌐',
    css: '🎨',
    js: '⚡',
    image: '🖼️',
    pdf: '📄',
    docx: '📝',
    xlsx: '📊',
    pptx: '📽️',
    text: '📃',
    data: '📋',
    other: '📎',
  }
  return icons[fileType] || icons.other
}
