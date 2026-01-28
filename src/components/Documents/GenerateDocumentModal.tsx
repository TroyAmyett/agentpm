// GenerateDocumentModal - Modal for generating branded documents from note content
import { useState, useEffect, useCallback } from 'react'
import { X, FileText, Loader2, FileDown, Check, AlertCircle } from 'lucide-react'
import { useBrandStore } from '@/stores/brandStore'
import { useAccountStore } from '@/stores/accountStore'
import { useAuthStore } from '@/stores/authStore'
import type { DocumentTypeCode } from '@/types/brand'
import { generateDocumentFromNote } from '@/services/documents/documentGenerator'
import type { Attachment } from '@/services/attachments/attachmentService'
import type { JSONContent } from '@tiptap/react'

interface GenerateDocumentModalProps {
  isOpen: boolean
  onClose: () => void
  noteId: string
  noteTitle: string
  noteContent: JSONContent
  onGenerated?: (attachment: Attachment) => void
}

type OutputFormat = 'docx' | 'md'

// Document type options for selection
const DOCUMENT_TYPES: { code: DocumentTypeCode; label: string; description: string }[] = [
  { code: 'PRD', label: 'PRD', description: 'Product Requirements Document' },
  { code: 'SOW', label: 'SOW', description: 'Statement of Work' },
  { code: 'RPT', label: 'Report', description: 'Analysis or Summary Report' },
  { code: 'PRP', label: 'Proposal', description: 'Business Proposal' },
  { code: 'DOC', label: 'General', description: 'General Document' },
]

export function GenerateDocumentModal({
  isOpen,
  onClose,
  noteId,
  noteTitle,
  noteContent,
  onGenerated,
}: GenerateDocumentModalProps) {
  const { currentAccountId } = useAccountStore()
  const { user } = useAuthStore()
  const { brandConfig, previewNextNumber, hasCompletedSetup } = useBrandStore()

  const [selectedType, setSelectedType] = useState<DocumentTypeCode>('DOC')
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('docx')
  const [previewNumber, setPreviewNumber] = useState<string>('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const hasBrand = hasCompletedSetup()
  const config = brandConfig?.brandConfig

  // Preview the document number when type changes
  useEffect(() => {
    if (!isOpen || !currentAccountId) return

    let mounted = true

    async function loadPreview() {
      try {
        const preview = await previewNextNumber(currentAccountId!, selectedType)
        if (mounted) {
          setPreviewNumber(preview)
        }
      } catch (err) {
        console.error('[GenerateDocumentModal] Failed to preview number:', err)
        if (mounted) {
          // Fallback preview
          const prefix = config?.docNumberPrefix || 'DOC'
          setPreviewNumber(`${prefix}-${selectedType}-001`)
        }
      }
    }

    loadPreview()

    return () => {
      mounted = false
    }
  }, [isOpen, currentAccountId, selectedType, previewNextNumber, config?.docNumberPrefix])

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedType('DOC')
      setOutputFormat('docx')
      setError(null)
      setSuccess(false)
    }
  }, [isOpen])

  const handleGenerate = useCallback(async () => {
    if (!currentAccountId || !user?.id) {
      setError('Account not configured')
      return
    }

    setIsGenerating(true)
    setError(null)

    try {
      const attachment = await generateDocumentFromNote({
        accountId: currentAccountId,
        userId: user.id,
        noteId,
        noteTitle,
        noteContent,
        documentType: selectedType,
        format: outputFormat,
      })

      if (attachment) {
        setSuccess(true)
        onGenerated?.(attachment)
        // Close after a short delay to show success
        setTimeout(() => {
          onClose()
        }, 1500)
      } else {
        setError('Failed to generate document')
      }
    } catch (err) {
      console.error('[GenerateDocumentModal] Generation error:', err)
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setIsGenerating(false)
    }
  }, [currentAccountId, user?.id, noteId, noteTitle, noteContent, selectedType, outputFormat, onGenerated, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="w-full max-w-md rounded-xl shadow-2xl"
        style={{
          background: 'var(--fl-color-bg-elevated)',
          border: '1px solid var(--fl-color-border)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--fl-color-border)' }}
        >
          <div className="flex items-center gap-2">
            <FileText size={20} style={{ color: '#0ea5e9' }} />
            <h2 className="text-lg font-medium" style={{ color: 'var(--fl-color-text-primary)' }}>
              Generate Document
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            disabled={isGenerating}
          >
            <X size={18} style={{ color: 'var(--fl-color-text-muted)' }} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-5">
          {/* Brand Status */}
          {hasBrand && config && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{ background: 'rgba(14, 165, 233, 0.1)' }}
            >
              <Check size={16} style={{ color: '#0ea5e9' }} />
              <span className="text-sm" style={{ color: '#0ea5e9' }}>
                Using {config.companyName} brand styling
              </span>
            </div>
          )}

          {!hasBrand && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{ background: 'rgba(251, 191, 36, 0.15)' }}
            >
              <AlertCircle size={16} style={{ color: '#fbbf24' }} />
              <span className="text-sm" style={{ color: '#fbbf24' }}>
                No brand configured - document will use default styling
              </span>
            </div>
          )}

          {/* Document Type Selection */}
          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: 'var(--fl-color-text-primary)' }}
            >
              Document Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {DOCUMENT_TYPES.map((type) => (
                <button
                  key={type.code}
                  onClick={() => setSelectedType(type.code)}
                  disabled={isGenerating}
                  className={`px-3 py-2 rounded-lg text-left transition-all ${
                    selectedType === type.code ? 'ring-2 ring-primary-500' : ''
                  }`}
                  style={{
                    background:
                      selectedType === type.code
                        ? 'rgba(14, 165, 233, 0.15)'
                        : 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid',
                    borderColor:
                      selectedType === type.code
                        ? '#0ea5e9'
                        : 'var(--fl-color-border)',
                  }}
                >
                  <div
                    className="text-sm font-medium"
                    style={{
                      color:
                        selectedType === type.code
                          ? '#0ea5e9'
                          : 'var(--fl-color-text-primary)',
                    }}
                  >
                    {type.label}
                  </div>
                  <div
                    className="text-xs mt-0.5"
                    style={{ color: 'var(--fl-color-text-muted)' }}
                  >
                    {type.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Document Number Preview */}
          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: 'var(--fl-color-text-primary)' }}
            >
              Document Number
            </label>
            <div
              className="px-3 py-2 rounded-lg font-mono text-sm"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'var(--fl-color-text-secondary)',
              }}
            >
              {previewNumber || '...'}
            </div>
          </div>

          {/* Output Format */}
          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: 'var(--fl-color-text-primary)' }}
            >
              Format
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setOutputFormat('docx')}
                disabled={isGenerating}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  outputFormat === 'docx' ? 'ring-2 ring-primary-500' : ''
                }`}
                style={{
                  background:
                    outputFormat === 'docx'
                      ? 'rgba(14, 165, 233, 0.15)'
                      : 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid',
                  borderColor:
                    outputFormat === 'docx'
                      ? '#0ea5e9'
                      : 'var(--fl-color-border)',
                  color:
                    outputFormat === 'docx'
                      ? '#0ea5e9'
                      : 'var(--fl-color-text-primary)',
                }}
              >
                Word (.docx)
              </button>
              <button
                onClick={() => setOutputFormat('md')}
                disabled={isGenerating}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  outputFormat === 'md' ? 'ring-2 ring-primary-500' : ''
                }`}
                style={{
                  background:
                    outputFormat === 'md'
                      ? 'rgba(14, 165, 233, 0.15)'
                      : 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid',
                  borderColor:
                    outputFormat === 'md'
                      ? '#0ea5e9'
                      : 'var(--fl-color-border)',
                  color:
                    outputFormat === 'md'
                      ? '#0ea5e9'
                      : 'var(--fl-color-text-primary)',
                }}
              >
                Markdown (.md)
              </button>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}
            >
              <AlertCircle size={16} />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Success Display */}
          {success && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' }}
            >
              <Check size={16} />
              <span className="text-sm">Document generated and attached!</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 px-6 py-4"
          style={{ borderTop: '1px solid var(--fl-color-border)' }}
        >
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-white/10"
            style={{ color: 'var(--fl-color-text-muted)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={isGenerating || success}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            style={{
              background: '#0ea5e9',
              color: 'white',
            }}
          >
            {isGenerating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Generating...
              </>
            ) : success ? (
              <>
                <Check size={16} />
                Done
              </>
            ) : (
              <>
                <FileDown size={16} />
                Generate
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
