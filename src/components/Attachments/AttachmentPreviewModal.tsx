// AttachmentPreviewModal - Inline preview for various file types
import { useState, useEffect } from 'react'
import {
  X,
  Download,
  ExternalLink,
  Loader2,
  FileText,
  AlertCircle,
} from 'lucide-react'
import { type Attachment, getDownloadUrl } from '@/services/attachments/attachmentService'

interface AttachmentPreviewModalProps {
  attachment: Attachment | null
  isOpen: boolean
  onClose: () => void
}

type PreviewType = 'image' | 'pdf' | 'video' | 'audio' | 'text' | 'office' | 'unsupported'

// Determine preview type from mime type
function getPreviewType(mimeType: string, fileType: string): PreviewType {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType.startsWith('text/') || fileType === 'text' || fileType === 'code') return 'text'

  // Office documents
  if (
    mimeType.includes('word') ||
    mimeType.includes('spreadsheet') ||
    mimeType.includes('presentation') ||
    mimeType.includes('excel') ||
    mimeType.includes('powerpoint') ||
    fileType === 'docx' ||
    fileType === 'xlsx' ||
    fileType === 'pptx'
  ) {
    return 'office'
  }

  return 'unsupported'
}

// Build Office Online viewer URL
function getOfficeViewerUrl(attachmentId: string): string {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const proxyUrl = `${baseUrl}/api/attachment/${attachmentId}`
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(proxyUrl)}`
}

export function AttachmentPreviewModal({
  attachment,
  isOpen,
  onClose,
}: AttachmentPreviewModalProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [contentUrl, setContentUrl] = useState<string | null>(null)
  const [textContent, setTextContent] = useState<string | null>(null)

  // Load content when attachment changes
  useEffect(() => {
    if (!attachment || !isOpen) {
      setContentUrl(null)
      setTextContent(null)
      setError(null)
      return
    }

    setIsLoading(true)
    setError(null)

    // Capture attachment in local const for closure
    const currentAttachment = attachment
    const previewType = getPreviewType(currentAttachment.mimeType, currentAttachment.fileType)

    async function loadContent() {
      try {
        if (previewType === 'office') {
          // Office docs use the viewer URL directly
          setContentUrl(getOfficeViewerUrl(currentAttachment.id))
          setIsLoading(false)
        } else if (previewType === 'text') {
          // Fetch text content
          const url = await getDownloadUrl(currentAttachment)
          if (url) {
            const response = await fetch(url)
            const text = await response.text()
            setTextContent(text)
          }
          setIsLoading(false)
        } else {
          // Images, PDFs, video, audio - get signed URL
          const url = await getDownloadUrl(currentAttachment)
          setContentUrl(url)
          setIsLoading(false)
        }
      } catch (err) {
        console.error('[Preview] Failed to load:', err)
        setError('Failed to load preview')
        setIsLoading(false)
      }
    }

    loadContent()
  }, [attachment, isOpen])

  // Handle download
  const handleDownload = async () => {
    if (!attachment) return
    try {
      const url = await getDownloadUrl(attachment)
      if (url) {
        window.open(url, '_blank')
      }
    } catch (err) {
      console.error('[Preview] Download failed:', err)
    }
  }

  // Handle open in new tab
  const handleOpenExternal = () => {
    if (contentUrl) {
      window.open(contentUrl, '_blank')
    }
  }

  if (!isOpen || !attachment) return null

  const previewType = getPreviewType(attachment.mimeType, attachment.fileType)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-5xl max-h-[90vh] mx-4 bg-surface-50 dark:bg-surface-900 rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-200 dark:border-surface-700 bg-surface-100 dark:bg-surface-800">
          <div className="flex items-center gap-3 min-w-0">
            <FileText size={20} className="text-primary-500 flex-shrink-0" />
            <div className="min-w-0">
              <h3 className="font-medium text-surface-900 dark:text-surface-100 truncate">
                {attachment.fileName}
              </h3>
              <p className="text-xs text-surface-500 dark:text-surface-400">
                {attachment.mimeType}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="p-2 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 transition-colors"
              title="Download"
            >
              <Download size={18} />
            </button>
            {contentUrl && previewType !== 'text' && (
              <button
                onClick={handleOpenExternal}
                className="p-2 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 transition-colors"
                title="Open in new tab"
              >
                <ExternalLink size={18} />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 transition-colors"
              title="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-surface-900/5 dark:bg-black/20">
          {isLoading ? (
            <div className="flex items-center justify-center h-96">
              <Loader2 size={32} className="animate-spin text-primary-500" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-96 text-surface-500">
              <AlertCircle size={48} className="mb-4 text-red-500" />
              <p>{error}</p>
              <button
                onClick={handleDownload}
                className="mt-4 px-4 py-2 rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors"
              >
                Download Instead
              </button>
            </div>
          ) : (
            <>
              {/* Image Preview */}
              {previewType === 'image' && contentUrl && (
                <div className="flex items-center justify-center p-4 min-h-96">
                  <img
                    src={contentUrl}
                    alt={attachment.fileName}
                    className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-lg"
                    onLoad={() => setIsLoading(false)}
                  />
                </div>
              )}

              {/* PDF Preview */}
              {previewType === 'pdf' && contentUrl && (
                <iframe
                  src={contentUrl}
                  className="w-full h-[75vh]"
                  title={attachment.fileName}
                />
              )}

              {/* Video Preview */}
              {previewType === 'video' && contentUrl && (
                <div className="flex items-center justify-center p-4">
                  <video
                    src={contentUrl}
                    controls
                    className="max-w-full max-h-[70vh] rounded-lg shadow-lg"
                  >
                    Your browser does not support video playback.
                  </video>
                </div>
              )}

              {/* Audio Preview */}
              {previewType === 'audio' && contentUrl && (
                <div className="flex items-center justify-center p-8">
                  <audio src={contentUrl} controls className="w-full max-w-md">
                    Your browser does not support audio playback.
                  </audio>
                </div>
              )}

              {/* Text/Code Preview */}
              {previewType === 'text' && textContent !== null && (
                <div className="p-4">
                  <pre className="p-4 rounded-lg bg-surface-800 dark:bg-surface-950 text-surface-100 text-sm overflow-auto max-h-[70vh] font-mono">
                    {textContent}
                  </pre>
                </div>
              )}

              {/* Office Document Preview (via Microsoft viewer) */}
              {previewType === 'office' && contentUrl && (
                <iframe
                  src={contentUrl}
                  className="w-full h-[75vh]"
                  title={attachment.fileName}
                  frameBorder="0"
                />
              )}

              {/* Unsupported */}
              {previewType === 'unsupported' && (
                <div className="flex flex-col items-center justify-center h-96 text-surface-500">
                  <FileText size={64} className="mb-4 opacity-30" />
                  <p className="text-lg font-medium">Preview not available</p>
                  <p className="text-sm mt-1">This file type cannot be previewed</p>
                  <button
                    onClick={handleDownload}
                    className="mt-4 px-4 py-2 rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors"
                  >
                    Download File
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
