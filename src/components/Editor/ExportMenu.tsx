import { useState } from 'react'
import { useNotesStore } from '@/stores/notesStore'
import { useTemplatesStore } from '@/stores/templatesStore'
import { toMarkdown, toMarkdownWithFrontmatter, downloadMarkdown, copyMarkdown } from '@/utils/markdown'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Download,
  Copy,
  FileText,
  Check,
  ChevronDown,
  FileCode,
  Layout,
} from 'lucide-react'
import { SaveAsTemplateModal } from './SaveAsTemplateModal'

export function ExportMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const { currentNoteId, notes, isAuthenticated } = useNotesStore()
  const { createTemplate } = useTemplatesStore()

  const currentNote = notes.find((n) => n.id === currentNoteId)

  if (!currentNote) return null

  const handleExportMarkdown = () => {
    const markdown = toMarkdown(currentNote.content)
    const filename = currentNote.title.replace(/[^a-z0-9]/gi, '-').toLowerCase() || 'note'
    downloadMarkdown(markdown, filename)
    setIsOpen(false)
  }

  const handleExportWithFrontmatter = () => {
    const markdown = toMarkdownWithFrontmatter(currentNote.content, {
      title: currentNote.title,
      date: new Date(currentNote.created_at),
      updated: new Date(currentNote.updated_at),
    })
    const filename = currentNote.title.replace(/[^a-z0-9]/gi, '-').toLowerCase() || 'note'
    downloadMarkdown(markdown, filename)
    setIsOpen(false)
  }

  const handleCopyMarkdown = async () => {
    const markdown = toMarkdown(currentNote.content)
    const success = await copyMarkdown(markdown)
    if (success) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
    setIsOpen(false)
  }

  const handleSaveAsTemplate = async (data: {
    name: string
    description: string
    icon: string
    category: string
  }) => {
    if (!currentNote.content) {
      throw new Error('Note has no content')
    }

    await createTemplate({
      name: data.name,
      description: data.description || undefined,
      icon: data.icon,
      category: data.category || undefined,
      content: currentNote.content,
    })
  }

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-[var(--fl-color-bg-elevated)]"
          style={{ color: 'var(--fl-color-text-secondary)' }}
        >
          <Download size={16} />
          Export
          <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        <AnimatePresence>
          {isOpen && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0"
                style={{ zIndex: 350 }}
                onClick={() => setIsOpen(false)}
              />

              {/* Dropdown */}
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute right-0 top-full mt-1 rounded-lg shadow-lg min-w-[220px]"
                style={{
                  zIndex: 400,
                  background: 'var(--fl-color-bg-surface)',
                  border: '1px solid var(--fl-color-border)',
                  padding: 'var(--fl-spacing-xs) 0'
                }}
              >
                <button
                  onClick={handleCopyMarkdown}
                  className="w-full flex items-center gap-3 text-sm"
                  style={{
                    padding: 'var(--fl-spacing-sm) var(--fl-spacing-md)',
                    color: 'var(--fl-color-text-secondary)',
                    transition: 'var(--fl-transition-fast)'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--fl-color-bg-elevated)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  {copied ? (
                    <Check size={16} style={{ color: 'var(--fl-color-success)' }} />
                  ) : (
                    <Copy size={16} style={{ color: 'var(--fl-color-text-muted)' }} />
                  )}
                  <span>{copied ? 'Copied!' : 'Copy as Markdown'}</span>
                </button>

                <button
                  onClick={handleExportMarkdown}
                  className="w-full flex items-center gap-3 text-sm"
                  style={{
                    padding: 'var(--fl-spacing-sm) var(--fl-spacing-md)',
                    color: 'var(--fl-color-text-secondary)',
                    transition: 'var(--fl-transition-fast)'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--fl-color-bg-elevated)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <FileText size={16} style={{ color: 'var(--fl-color-text-muted)' }} />
                  <span>Download .md</span>
                </button>

                <button
                  onClick={handleExportWithFrontmatter}
                  className="w-full flex items-center gap-3 text-sm"
                  style={{
                    padding: 'var(--fl-spacing-sm) var(--fl-spacing-md)',
                    color: 'var(--fl-color-text-secondary)',
                    transition: 'var(--fl-transition-fast)'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--fl-color-bg-elevated)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <FileCode size={16} style={{ color: 'var(--fl-color-text-muted)' }} />
                  <span>Download with Frontmatter</span>
                </button>

                {/* Save as Template - only show when authenticated */}
                {isAuthenticated && currentNote.content && (
                  <>
                    <div
                      style={{
                        borderTop: '1px solid var(--fl-color-border)',
                        margin: 'var(--fl-spacing-xs) 0',
                      }}
                    />
                    <button
                      onClick={() => {
                        setIsOpen(false)
                        setShowTemplateModal(true)
                      }}
                      className="w-full flex items-center gap-3 text-sm"
                      style={{
                        padding: 'var(--fl-spacing-sm) var(--fl-spacing-md)',
                        color: 'var(--fl-color-primary)',
                        transition: 'var(--fl-transition-fast)'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--fl-color-bg-elevated)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <Layout size={16} />
                      <span>Save as Template</span>
                    </button>
                  </>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Save as Template Modal */}
      <SaveAsTemplateModal
        isOpen={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        onSave={handleSaveAsTemplate}
        defaultName={currentNote.title !== 'Untitled' ? `${currentNote.title} Template` : ''}
      />
    </>
  )
}
