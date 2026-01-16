import { useState } from 'react'
import { useNotesStore } from '@/stores/notesStore'
import { toMarkdown, toMarkdownWithFrontmatter, downloadMarkdown, copyMarkdown } from '@/utils/markdown'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@funnelists/ui'
import {
  Download,
  Copy,
  FileText,
  Check,
  ChevronDown,
  FileCode,
} from 'lucide-react'

export function ExportMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const { currentNoteId, notes } = useNotesStore()

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

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        rightIcon={<ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />}
      >
        <Download size={16} />
        Export
      </Button>

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
              className="absolute right-0 top-full mt-1 rounded-lg shadow-lg min-w-[200px]"
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
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
