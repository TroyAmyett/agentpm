// AttachmentPanel - Main panel for viewing and managing attachments
import { useState, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronRight, Paperclip, Loader2 } from 'lucide-react'
import { AttachmentItem } from './AttachmentItem'
import { AttachmentDropzone } from './AttachmentDropzone'
import {
  fetchAttachments,
  type Attachment,
  type EntityType,
} from '@/services/attachments/attachmentService'

interface AttachmentPanelProps {
  entityType: EntityType
  entityId: string
  accountId: string
  userId: string
  readOnly?: boolean
  defaultExpanded?: boolean
  className?: string
}

export function AttachmentPanel({
  entityType,
  entityId,
  accountId,
  userId,
  readOnly = false,
  defaultExpanded = true,
  className = '',
}: AttachmentPanelProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Fetch attachments on mount and when entity changes
  useEffect(() => {
    let mounted = true

    async function loadAttachments() {
      if (!entityId) {
        setAttachments([])
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      try {
        const data = await fetchAttachments(entityType, entityId)
        if (mounted) {
          setAttachments(data)
        }
      } catch (error) {
        console.error('[AttachmentPanel] Failed to load attachments:', error)
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    loadAttachments()

    return () => {
      mounted = false
    }
  }, [entityType, entityId])

  // Handle new upload
  const handleUpload = useCallback((attachment: Attachment) => {
    setAttachments((prev) => [attachment, ...prev])
  }, [])

  // Handle delete
  const handleDelete = useCallback((attachmentId: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== attachmentId))
  }, [])

  const attachmentCount = attachments.length

  return (
    <div
      className={`rounded-xl overflow-hidden ${className}`}
      style={{
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid var(--fl-color-border)',
      }}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 transition-colors hover:bg-white/5"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown size={16} style={{ color: 'var(--fl-color-text-muted)' }} />
          ) : (
            <ChevronRight size={16} style={{ color: 'var(--fl-color-text-muted)' }} />
          )}
          <Paperclip size={16} style={{ color: 'var(--fl-color-text-muted)' }} />
          <span
            className="text-sm font-medium"
            style={{ color: 'var(--fl-color-text-primary)' }}
          >
            Attachments
          </span>
          {attachmentCount > 0 && (
            <span
              className="px-1.5 py-0.5 rounded-full text-xs"
              style={{
                background: 'rgba(14, 165, 233, 0.2)',
                color: '#0ea5e9',
              }}
            >
              {attachmentCount}
            </span>
          )}
        </div>

        {isLoading && (
          <Loader2
            size={14}
            className="animate-spin"
            style={{ color: 'var(--fl-color-text-muted)' }}
          />
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 pb-4">
          {/* Attachment List */}
          {attachments.length > 0 && (
            <div className="space-y-1 mb-3">
              {attachments.map((attachment) => (
                <AttachmentItem
                  key={attachment.id}
                  attachment={attachment}
                  onDelete={readOnly ? undefined : handleDelete}
                  readOnly={readOnly}
                />
              ))}
            </div>
          )}

          {/* Empty state (when no attachments and not read-only) */}
          {attachments.length === 0 && !isLoading && !readOnly && (
            <p
              className="text-xs text-center py-2 mb-2"
              style={{ color: 'var(--fl-color-text-muted)' }}
            >
              No attachments yet
            </p>
          )}

          {/* Dropzone (when not read-only) */}
          {!readOnly && entityId && (
            <AttachmentDropzone
              entityType={entityType}
              entityId={entityId}
              accountId={accountId}
              userId={userId}
              onUpload={handleUpload}
            />
          )}

          {/* Read-only empty state */}
          {attachments.length === 0 && !isLoading && readOnly && (
            <p
              className="text-xs text-center py-4"
              style={{ color: 'var(--fl-color-text-muted)' }}
            >
              No attachments
            </p>
          )}
        </div>
      )}
    </div>
  )
}
