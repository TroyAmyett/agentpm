// AttachmentManagerModal - Full-screen modal for managing attachments
import { useState, useEffect, useCallback } from 'react'
import { X, Paperclip, Loader2 } from 'lucide-react'
import { AttachmentItem } from './AttachmentItem'
import { AttachmentDropzone } from './AttachmentDropzone'
import { AttachmentPreviewModal } from './AttachmentPreviewModal'
import {
  fetchAttachments,
  type Attachment,
  type EntityType,
} from '@/services/attachments/attachmentService'

interface AttachmentManagerModalProps {
  isOpen: boolean
  onClose: () => void
  entityType: EntityType
  entityId: string
  entityName?: string
  accountId: string
  userId: string
  readOnly?: boolean
}

export function AttachmentManagerModal({
  isOpen,
  onClose,
  entityType,
  entityId,
  entityName = 'Note',
  accountId,
  userId,
  readOnly = false,
}: AttachmentManagerModalProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null)

  // Fetch attachments when modal opens
  useEffect(() => {
    if (!isOpen || !entityId) return

    let mounted = true

    async function loadAttachments() {
      setIsLoading(true)
      try {
        const data = await fetchAttachments(entityType, entityId)
        if (mounted) {
          setAttachments(data)
        }
      } catch (error) {
        console.error('[AttachmentManagerModal] Failed to load attachments:', error)
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
  }, [isOpen, entityType, entityId])

  // Handle new upload
  const handleUpload = useCallback((attachment: Attachment) => {
    setAttachments((prev) => [attachment, ...prev])
  }, [])

  // Handle delete
  const handleDelete = useCallback((attachmentId: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== attachmentId))
  }, [])

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !previewAttachment) {
        onClose()
      }
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose, previewAttachment])

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative w-full max-w-2xl mx-4 bg-surface-50 dark:bg-surface-900 rounded-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200 dark:border-surface-700">
            <div className="flex items-center gap-3">
              <Paperclip size={20} className="text-primary-500" />
              <div>
                <h2 className="font-semibold text-surface-900 dark:text-surface-100">
                  Attachments
                </h2>
                <p className="text-sm text-surface-500 dark:text-surface-400">
                  {entityName}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 max-h-[60vh] overflow-y-auto">
            {/* Upload Zone */}
            {!readOnly && (
              <div className="mb-6">
                <AttachmentDropzone
                  entityType={entityType}
                  entityId={entityId}
                  accountId={accountId}
                  userId={userId}
                  onUpload={handleUpload}
                />
              </div>
            )}

            {/* Attachment List */}
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-primary-500" />
              </div>
            ) : attachments.length > 0 ? (
              <div className="space-y-2">
                {attachments.map((attachment) => (
                  <AttachmentItem
                    key={attachment.id}
                    attachment={attachment}
                    onDelete={readOnly ? undefined : handleDelete}
                    onPreview={setPreviewAttachment}
                    readOnly={readOnly}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-surface-500 dark:text-surface-400">
                <Paperclip size={32} className="mx-auto mb-3 opacity-30" />
                <p>No attachments yet</p>
                {!readOnly && (
                  <p className="text-sm mt-1">Drag files above or click to upload</p>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-surface-200 dark:border-surface-700 bg-surface-100 dark:bg-surface-800">
            <span className="text-sm text-surface-500 dark:text-surface-400">
              {attachments.length} {attachments.length === 1 ? 'file' : 'files'}
            </span>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-surface-200 dark:bg-surface-700 hover:bg-surface-300 dark:hover:bg-surface-600 text-surface-700 dark:text-surface-200 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      <AttachmentPreviewModal
        attachment={previewAttachment}
        isOpen={previewAttachment !== null}
        onClose={() => setPreviewAttachment(null)}
      />
    </>
  )
}
