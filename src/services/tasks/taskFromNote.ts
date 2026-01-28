// Task From Note Service
// Creates a task from a note with optional attachment transfer

import type { JSONContent } from '@tiptap/react'
import type { Note } from '@/types/index'
import type { Task, TaskPriority, TaskStatus } from '@/types/agentpm'
import type { Attachment } from '@/services/attachments/attachmentService'
import { useTaskStore } from '@/stores/taskStore'
import { useNotesStore } from '@/stores/notesStore'
import { supabase } from '@/services/supabase/client'

// ============================================================================
// TYPES
// ============================================================================

export interface CreateTaskFromNoteParams {
  accountId: string
  userId: string
  note: Note
  taskData: {
    title: string
    projectId?: string
    priority: TaskPriority
    status: TaskStatus
  }
  includeAttachments: boolean
  attachments?: Attachment[]
}

// ============================================================================
// CONTENT CONVERSION
// ============================================================================

/**
 * Convert Tiptap JSONContent to plain text for task description
 */
function jsonContentToPlainText(content: JSONContent | null): string {
  if (!content) return ''

  const lines: string[] = []

  function processNode(node: JSONContent): void {
    if (!node) return

    if (node.type === 'text') {
      return // Text nodes are handled in extractText
    }

    switch (node.type) {
      case 'doc':
        node.content?.forEach(child => processNode(child))
        break

      case 'paragraph':
        const text = extractText(node)
        if (text) lines.push(text)
        break

      case 'heading': {
        const headingText = extractText(node)
        if (headingText) lines.push(headingText)
        break
      }

      case 'bulletList':
      case 'orderedList':
        node.content?.forEach((item, index) => {
          const marker = node.type === 'bulletList' ? '• ' : `${index + 1}. `
          const itemText = extractText(item)
          if (itemText) lines.push(marker + itemText)
        })
        break

      case 'taskList':
        node.content?.forEach(item => {
          const checked = item.attrs?.checked ? '[x]' : '[ ]'
          const itemText = extractText(item)
          if (itemText) lines.push(`${checked} ${itemText}`)
        })
        break

      case 'blockquote':
        const quoteText = extractText(node)
        if (quoteText) lines.push('> ' + quoteText)
        break

      case 'codeBlock':
        lines.push('```')
        const codeText = extractText(node)
        if (codeText) lines.push(codeText)
        lines.push('```')
        break

      default:
        node.content?.forEach(child => processNode(child))
    }
  }

  function extractText(node: JSONContent): string {
    if (!node) return ''
    if (node.type === 'text') return node.text || ''
    if (!node.content) return ''
    return node.content.map(child => extractText(child)).join('')
  }

  processNode(content)

  return lines.join('\n').trim()
}

// ============================================================================
// ATTACHMENT COPYING
// ============================================================================

/**
 * Copy attachments from one entity to another
 */
async function copyAttachmentsToTask(
  attachments: Attachment[],
  taskId: string,
  accountId: string,
  userId: string
): Promise<Attachment[]> {
  if (!supabase) {
    console.error('[TaskFromNote] Supabase not configured')
    return []
  }

  const copiedAttachments: Attachment[] = []

  for (const attachment of attachments) {
    try {
      // Download the original file
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('attachments')
        .download(attachment.storagePath)

      if (downloadError) {
        console.error('[TaskFromNote] Failed to download attachment:', downloadError)
        continue
      }

      // Create new storage path for task
      const newStoragePath = `${accountId}/tasks/${taskId}/${attachment.fileName}`

      // Upload to new location
      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(newStoragePath, fileData, {
          contentType: attachment.mimeType,
          upsert: true,
        })

      if (uploadError) {
        console.error('[TaskFromNote] Failed to upload attachment:', uploadError)
        continue
      }

      // Create new attachment record
      const { data: newAttachment, error: insertError } = await supabase
        .from('attachments')
        .insert({
          account_id: accountId,
          entity_type: 'task',
          entity_id: taskId,
          file_name: attachment.fileName,
          file_type: attachment.fileType,
          mime_type: attachment.mimeType,
          file_size: attachment.fileSize,
          storage_path: newStoragePath,
          description: attachment.description,
          source: attachment.source,
          created_by: userId,
        })
        .select()
        .single()

      if (insertError) {
        console.error('[TaskFromNote] Failed to create attachment record:', insertError)
        // Clean up uploaded file
        await supabase.storage.from('attachments').remove([newStoragePath])
        continue
      }

      copiedAttachments.push({
        id: newAttachment.id,
        accountId: newAttachment.account_id,
        entityType: newAttachment.entity_type,
        entityId: newAttachment.entity_id,
        fileName: newAttachment.file_name,
        fileType: newAttachment.file_type,
        mimeType: newAttachment.mime_type,
        fileSize: newAttachment.file_size,
        storagePath: newAttachment.storage_path,
        description: newAttachment.description,
        source: newAttachment.source,
        createdAt: newAttachment.created_at,
        createdBy: newAttachment.created_by,
      })

      console.log(`[TaskFromNote] Copied attachment: ${attachment.fileName}`)
    } catch (error) {
      console.error('[TaskFromNote] Error copying attachment:', error)
    }
  }

  console.log(`[TaskFromNote] Copied ${copiedAttachments.length}/${attachments.length} attachments`)
  return copiedAttachments
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Create a task from a note with optional attachment transfer
 */
export async function createTaskFromNote(
  params: CreateTaskFromNoteParams
): Promise<Task | null> {
  const {
    accountId,
    userId,
    note,
    taskData,
    includeAttachments,
    attachments = [],
  } = params

  try {
    // Convert note content to description
    const description = jsonContentToPlainText(note.content)

    // Create the task
    const taskStore = useTaskStore.getState()
    const task = await taskStore.createTask({
      accountId,
      title: taskData.title,
      description: description || undefined,
      projectId: taskData.projectId,
      priority: taskData.priority,
      status: taskData.status,
      sourceNoteId: note.id,
      // Audit fields
      createdBy: userId,
      createdByType: 'user',
      updatedBy: userId,
      updatedByType: 'user',
    })

    console.log(`[TaskFromNote] Created task: ${task.id}`)

    // Copy attachments if requested
    if (includeAttachments && attachments.length > 0) {
      await copyAttachmentsToTask(attachments, task.id, accountId, userId)
    }

    // Update the note with link to the task
    const notesStore = useNotesStore.getState()
    await notesStore.updateNote(note.id, {
      entity_type: 'task',
      entity_id: task.id,
    })

    console.log(`[TaskFromNote] Updated note ${note.id} with task link`)

    return task
  } catch (error) {
    console.error('[TaskFromNote] Failed to create task from note:', error)
    throw error
  }
}
