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
          relative cursor-pointer rounded-lg border-2 border-dashed p-6
          transition-colors flex flex-col items-center justify-center gap-2
          ${isDragging
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
            : 'border-surface-300 dark:border-surface-600 hover:border-primary-400 hover:bg-surface-50 dark:hover:bg-surface-800/50'
          }
          ${isUploading ? 'pointer-events-none opacity-60' : ''}
        `}
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
            <Loader2 size={24} className="animate-spin text-primary-500" />
            <span className="text-sm text-surface-600 dark:text-surface-400">
              Uploading...
            </span>
          </>
        ) : (
          <>
            <Upload size={24} className="text-surface-400" />
            <span className="text-sm text-surface-600 dark:text-surface-400">
              Drop file here or click to upload
            </span>
            <span className="text-xs text-surface-500">
              Max {maxSizeMB}MB
            </span>
          </>
        )}
      </div>

      {error && (
        <div className="mt-2 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <X size={14} />
          {error}
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
