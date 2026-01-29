// TaskAttachmentsSection - Attachments panel with inheritance support
import { useState, useEffect, useCallback } from 'react'
import {
  Paperclip,
  Loader2,
  ChevronDown,
  ChevronRight,
  Download,
  Trash2,
  ExternalLink,
  FileText,
  FileSpreadsheet,
  Presentation,
  Image,
  File,
  Link2,
  Eye,
} from 'lucide-react'
import {
  fetchTaskAttachmentsWithInheritance,
  getDownloadUrl,
  deleteAttachment,
  formatFileSize,
  type Attachment,
} from '@/services/attachments/attachmentService'
import { AttachmentDropzone } from '@/components/Attachments/AttachmentDropzone'
import { AttachmentPreviewModal } from '@/components/Attachments/AttachmentPreviewModal'
import type { Task } from '@/types/agentpm'

interface TaskAttachmentsSectionProps {
  task: Task
  allTasks?: Task[]
  accountId: string
  userId: string
  readOnly?: boolean
}

// Get icon component for file type
function getFileTypeIcon(fileType: string) {
  switch (fileType) {
    case 'docx':
    case 'text':
    case 'pdf':
      return FileText
    case 'xlsx':
      return FileSpreadsheet
    case 'pptx':
      return Presentation
    case 'image':
      return Image
    default:
      return File
  }
}

export function TaskAttachmentsSection({
  task,
  allTasks = [],
  accountId,
  userId,
  readOnly = false,
}: TaskAttachmentsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null)

  // Find parent task name by ID
  const getTaskName = useCallback((taskId: string): string => {
    const foundTask = allTasks.find(t => t.id === taskId)
    return foundTask?.title || 'Parent Task'
  }, [allTasks])

  // Load attachments with inheritance
  useEffect(() => {
    let mounted = true

    async function loadAttachments() {
      setIsLoading(true)
      try {
        const data = await fetchTaskAttachmentsWithInheritance(task.id)
        if (mounted) {
          setAttachments(data)
        }
      } catch (error) {
        console.error('[TaskAttachments] Failed to load:', error)
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    loadAttachments()
    return () => { mounted = false }
  }, [task.id])

  // Handle download
  const handleDownload = async (attachment: Attachment) => {
    setDownloadingId(attachment.id)
    try {
      const url = await getDownloadUrl(attachment)
      if (url) {
        // Open in new tab or trigger download
        window.open(url, '_blank')
      }
    } catch (error) {
      console.error('[TaskAttachments] Download failed:', error)
    } finally {
      setDownloadingId(null)
    }
  }

  // Handle delete
  const handleDelete = async (attachment: Attachment) => {
    if (!window.confirm(`Delete "${attachment.fileName}"?`)) return

    setDeletingId(attachment.id)
    try {
      const success = await deleteAttachment(attachment.id)
      if (success) {
        setAttachments(prev => prev.filter(a => a.id !== attachment.id))
      }
    } catch (error) {
      console.error('[TaskAttachments] Delete failed:', error)
    } finally {
      setDeletingId(null)
    }
  }

  // Handle new upload
  const handleUpload = useCallback((attachment: Attachment) => {
    setAttachments(prev => [attachment, ...prev])
  }, [])

  // Separate owned vs inherited
  const ownedAttachments = attachments.filter(a => !a.isInherited)
  const inheritedAttachments = attachments.filter(a => a.isInherited)

  return (
    <div>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-3 hover:text-surface-700 dark:hover:text-surface-300 transition-colors"
      >
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Paperclip size={14} />
        <span>Attachments</span>
        {attachments.length > 0 && (
          <span className="px-1.5 py-0.5 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 text-xs normal-case">
            {attachments.length}
          </span>
        )}
        {isLoading && (
          <Loader2 size={12} className="animate-spin ml-1" />
        )}
      </button>

      {isExpanded && (
        <div className="space-y-4">
          {/* Owned Attachments */}
          {ownedAttachments.length > 0 && (
            <div className="space-y-2">
              {ownedAttachments.map((attachment) => {
                const IconComponent = getFileTypeIcon(attachment.fileType)
                const isDownloading = downloadingId === attachment.id
                const isDeleting = deletingId === attachment.id

                return (
                  <div
                    key={attachment.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-surface-50 dark:bg-surface-900/50 group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                      <IconComponent size={16} className="text-primary-600 dark:text-primary-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-surface-900 dark:text-surface-100 truncate">
                        {attachment.fileName}
                      </p>
                      <p className="text-xs text-surface-500 dark:text-surface-400">
                        {formatFileSize(attachment.fileSize)}
                        {attachment.source === 'agent' && (
                          <span className="ml-2 px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-xs">
                            Agent
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setPreviewAttachment(attachment)}
                        className="p-1.5 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                        title="Preview"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={() => handleDownload(attachment)}
                        disabled={isDownloading}
                        className="p-1.5 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 transition-colors disabled:opacity-50"
                        title="Download"
                      >
                        {isDownloading ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Download size={14} />
                        )}
                      </button>
                      {!readOnly && (
                        <button
                          onClick={() => handleDelete(attachment)}
                          disabled={isDeleting}
                          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-surface-500 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                          title="Delete"
                        >
                          {isDeleting ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Trash2 size={14} />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Inherited Attachments */}
          {inheritedAttachments.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-surface-500 dark:text-surface-400">
                <Link2 size={12} />
                <span>Inherited from parent</span>
              </div>
              {inheritedAttachments.map((attachment) => {
                const IconComponent = getFileTypeIcon(attachment.fileType)
                const isDownloading = downloadingId === attachment.id

                return (
                  <div
                    key={attachment.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-surface-50/50 dark:bg-surface-900/30 border border-dashed border-surface-200 dark:border-surface-700 group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-surface-200 dark:bg-surface-700 flex items-center justify-center flex-shrink-0">
                      <IconComponent size={16} className="text-surface-500 dark:text-surface-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-surface-700 dark:text-surface-300 truncate">
                        {attachment.fileName}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-surface-500 dark:text-surface-400">
                        <span>{formatFileSize(attachment.fileSize)}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <ExternalLink size={10} />
                          {attachment.inheritedFromTaskId && getTaskName(attachment.inheritedFromTaskId)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setPreviewAttachment(attachment)}
                        className="p-1.5 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                        title="Preview"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={() => handleDownload(attachment)}
                        disabled={isDownloading}
                        className="p-1.5 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 transition-colors disabled:opacity-50"
                        title="Download"
                      >
                        {isDownloading ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Download size={14} />
                        )}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Empty State */}
          {!isLoading && attachments.length === 0 && (
            <p className="text-sm text-surface-500 dark:text-surface-400 text-center py-4">
              No attachments
            </p>
          )}

          {/* Upload Dropzone */}
          {!readOnly && (
            <AttachmentDropzone
              entityType="task"
              entityId={task.id}
              accountId={accountId}
              userId={userId}
              onUpload={handleUpload}
            />
          )}
        </div>
      )}

      {/* Preview Modal */}
      <AttachmentPreviewModal
        attachment={previewAttachment}
        isOpen={previewAttachment !== null}
        onClose={() => setPreviewAttachment(null)}
      />
    </div>
  )
}
