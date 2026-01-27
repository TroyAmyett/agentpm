// Attachment Dropzone - Drag and drop file upload component

import { useState, useRef, useCallback } from 'react'
import { Upload, X, FileText, Image, File, Loader2 } from 'lucide-react'
import {
  uploadAttachment,
  formatFileSize,
  type Attachment,
  type EntityType,
} from '@/services/attachments/attachmentService'

interface AttachmentDropzoneProps {
  entityType: EntityType
  entityId: string
  accountId: string
  userId: string
  onUpload?: (attachment: Attachment) => void
  maxSizeMB?: number
  className?: string
}

// Allowed file types for upload
const ALLOWED_EXTENSIONS = [
  '.txt', '.md', '.csv', '.json',
  '.html', '.css', '.js', '.ts', '.tsx', '.jsx',
  '.pdf', '.docx', '.xlsx', '.pptx',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
]

const MAX_FILE_SIZE_MB = 25

export function AttachmentDropzone({
  entityType,
  entityId,
  accountId,
  userId,
  onUpload,
  maxSizeMB = MAX_FILE_SIZE_MB,
  className = '',
}: AttachmentDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const validateFile = useCallback((file: File): string | null => {
    // Check size
    const sizeMB = file.size / (1024 * 1024)
    if (sizeMB > maxSizeMB) {
      return `File too large. Maximum size is ${maxSizeMB}MB`
    }

    // Check extension
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `File type not supported. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`
    }

    return null
  }, [maxSizeMB])

  const handleUpload = useCallback(async (file: File) => {
    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      return
    }

    setIsUploading(true)
    setError(null)

    const result = await uploadAttachment(
      file,
      accountId,
      entityType,
      entityId,
      userId,
      'user'
    )

    setIsUploading(false)

    if (result.success && result.attachment) {
      onUpload?.(result.attachment)
    } else {
      setError(result.error || 'Upload failed')
    }
  }, [accountId, entityType, entityId, userId, onUpload, validateFile])

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleUpload(files[0])
    }
  }

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleUpload(files[0])
    }
    // Reset input
    e.target.value = ''
  }

  return (
    <div className={className}>
      <div
        onClick={handleClick}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`
          relative cursor-pointer rounded-lg border-2 border-dashed p-4
          transition-all flex flex-col items-center justify-center gap-2
          ${isUploading ? 'pointer-events-none opacity-60' : ''}
        `}
        style={{
          borderColor: isDragging ? '#0ea5e9' : 'rgba(255, 255, 255, 0.1)',
          background: isDragging ? 'rgba(14, 165, 233, 0.1)' : 'rgba(255, 255, 255, 0.02)',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_EXTENSIONS.join(',')}
          onChange={handleFileChange}
          className="hidden"
        />

        {isUploading ? (
          <>
            <Loader2 size={20} className="animate-spin" style={{ color: '#0ea5e9' }} />
            <span className="text-sm" style={{ color: 'var(--fl-color-text-muted)' }}>
              Uploading...
            </span>
          </>
        ) : (
          <>
            <Upload size={20} style={{ color: isDragging ? '#0ea5e9' : 'var(--fl-color-text-muted)' }} />
            <span className="text-sm" style={{ color: isDragging ? '#0ea5e9' : 'var(--fl-color-text-muted)' }}>
              Drop files here or click to upload
            </span>
            <span className="text-xs" style={{ color: 'var(--fl-color-text-muted)', opacity: 0.7 }}>
              Max {maxSizeMB}MB
            </span>
          </>
        )}
      </div>

      {error && (
        <div
          className="mt-2 flex items-center gap-2 p-2 rounded-lg text-sm"
          style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}
        >
          <X size={14} />
          <span className="flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            className="p-0.5 rounded hover:bg-white/10"
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  )
}

// Compact attachment list component
interface AttachmentListProps {
  attachments: Attachment[]
  onDelete?: (id: string) => void
  showDelete?: boolean
}

export function AttachmentList({
  attachments,
  onDelete,
  showDelete = true,
}: AttachmentListProps) {
  const getIcon = (fileType: string) => {
    if (fileType === 'image') return <Image size={14} className="text-purple-500" />
    if (['html', 'css', 'js', 'data'].includes(fileType)) return <FileText size={14} className="text-blue-500" />
    return <File size={14} className="text-surface-400" />
  }

  if (attachments.length === 0) return null

  return (
    <div className="space-y-1">
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className="flex items-center gap-2 p-2 rounded-lg bg-surface-50 dark:bg-surface-800/50"
        >
          {getIcon(attachment.fileType)}
          <span className="flex-1 text-sm truncate">{attachment.fileName}</span>
          <span className="text-xs text-surface-500">
            {formatFileSize(attachment.fileSize)}
          </span>
          {showDelete && onDelete && (
            <button
              onClick={() => onDelete(attachment.id)}
              className="p-1 rounded hover:bg-surface-200 dark:hover:bg-surface-700"
            >
              <X size={14} className="text-surface-400" />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
