// AttachmentItem - Single attachment row with actions
import { useState, useCallback } from 'react'
import {
  FileText,
  FileSpreadsheet,
  Presentation,
  Image,
  File,
  Download,
  Trash2,
  Loader2,
  FileCode,
  FileJson,
  Eye,
} from 'lucide-react'
import type { Attachment } from '@/services/attachments/attachmentService'
import { formatFileSize, getDownloadUrl, deleteAttachment } from '@/services/attachments/attachmentService'

interface AttachmentItemProps {
  attachment: Attachment
  onDelete?: (id: string) => void
  onPreview?: (attachment: Attachment) => void
  readOnly?: boolean
}

// Get icon component based on file type
function getFileIconComponent(fileType: string) {
  switch (fileType) {
    case 'docx':
    case 'pdf':
    case 'text':
      return FileText
    case 'xlsx':
      return FileSpreadsheet
    case 'pptx':
      return Presentation
    case 'image':
      return Image
    case 'html':
    case 'css':
    case 'js':
      return FileCode
    case 'data':
      return FileJson
    default:
      return File
  }
}

// Get color for file type
function getFileTypeColor(fileType: string): string {
  switch (fileType) {
    case 'docx':
      return '#2563eb' // blue
    case 'xlsx':
      return '#16a34a' // green
    case 'pptx':
      return '#ea580c' // orange
    case 'pdf':
      return '#dc2626' // red
    case 'image':
      return '#8b5cf6' // purple
    default:
      return 'var(--fl-color-text-muted)'
  }
}

export function AttachmentItem({ attachment, onDelete, onPreview, readOnly }: AttachmentItemProps) {
  const [isDownloading, setIsDownloading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const IconComponent = getFileIconComponent(attachment.fileType)
  const iconColor = getFileTypeColor(attachment.fileType)

  const handleDownload = useCallback(async () => {
    setIsDownloading(true)
    try {
      const url = await getDownloadUrl(attachment)
      if (url) {
        // Open in new tab (browsers will handle download based on content-disposition)
        const link = document.createElement('a')
        link.href = url
        link.download = attachment.fileName
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }
    } catch (error) {
      console.error('[AttachmentItem] Download failed:', error)
    } finally {
      setIsDownloading(false)
    }
  }, [attachment])

  const handleDelete = useCallback(async () => {
    if (!onDelete) return

    setIsDeleting(true)
    try {
      const success = await deleteAttachment(attachment.id)
      if (success) {
        onDelete(attachment.id)
      }
    } catch (error) {
      console.error('[AttachmentItem] Delete failed:', error)
    } finally {
      setIsDeleting(false)
    }
  }, [attachment.id, onDelete])

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors group"
      style={{ background: 'rgba(255, 255, 255, 0.02)' }}
    >
      {/* File Icon */}
      <div
        className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
        style={{ background: `${iconColor}20` }}
      >
        <IconComponent size={16} style={{ color: iconColor }} />
      </div>

      {/* File Info */}
      <div className="flex-1 min-w-0">
        <div
          className="text-sm font-medium truncate"
          style={{ color: 'var(--fl-color-text-primary)' }}
          title={attachment.fileName}
        >
          {attachment.fileName}
        </div>
        <div className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
          {formatFileSize(attachment.fileSize)}
          {attachment.source === 'agent' && (
            <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-purple-500/20 text-purple-400">
              Agent
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {onPreview && (
          <button
            onClick={() => onPreview(attachment)}
            className="p-1.5 rounded hover:bg-white/10 transition-colors"
            title="Preview"
          >
            <Eye size={14} style={{ color: 'var(--fl-color-text-muted)' }} />
          </button>
        )}
        <button
          onClick={handleDownload}
          disabled={isDownloading}
          className="p-1.5 rounded hover:bg-white/10 transition-colors disabled:opacity-50"
          title="Download"
        >
          {isDownloading ? (
            <Loader2 size={14} className="animate-spin" style={{ color: 'var(--fl-color-text-muted)' }} />
          ) : (
            <Download size={14} style={{ color: 'var(--fl-color-text-muted)' }} />
          )}
        </button>

        {!readOnly && onDelete && (
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="p-1.5 rounded hover:bg-red-500/20 transition-colors disabled:opacity-50"
            title="Delete"
          >
            {isDeleting ? (
              <Loader2 size={14} className="animate-spin" style={{ color: '#ef4444' }} />
            ) : (
              <Trash2 size={14} style={{ color: '#ef4444' }} />
            )}
          </button>
        )}
      </div>
    </div>
  )
}
