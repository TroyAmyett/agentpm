// Skill Picker Modal - Shows when a repo has multiple skill files to import

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, FileText, Download, Loader2, CheckCircle, FolderOpen, Square, CheckSquare } from 'lucide-react'
import type { RepoSkillFile } from '@/services/skills/index'

interface SkillPickerModalProps {
  isOpen: boolean
  onClose: () => void
  repoName: string
  skillFiles: RepoSkillFile[]
  onImport: (file: RepoSkillFile) => Promise<void>
}

interface SkillPreview {
  name: string
  description: string
  loading: boolean
  error?: string
}

// Extract name and description from skill content (frontmatter or first lines)
function parseSkillPreview(content: string, fallbackName: string): { name: string; description: string } {
  // Try to parse YAML frontmatter
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1]
    const nameMatch = frontmatter.match(/^name:\s*['"]?(.+?)['"]?\s*$/m)
    const descMatch = frontmatter.match(/^description:\s*['"]?(.+?)['"]?\s*$/m)

    return {
      name: nameMatch?.[1] || fallbackName,
      description: descMatch?.[1] || extractFirstParagraph(content.slice(frontmatterMatch[0].length)),
    }
  }

  // No frontmatter - try to extract from content
  // Look for # Heading as name
  const headingMatch = content.match(/^#\s+(.+)$/m)
  const name = headingMatch?.[1] || fallbackName

  return {
    name,
    description: extractFirstParagraph(content),
  }
}

function extractFirstParagraph(content: string): string {
  // Remove frontmatter if present
  const withoutFrontmatter = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '')

  // Find first non-empty, non-heading paragraph
  const lines = withoutFrontmatter.split('\n')
  let paragraph = ''

  for (const line of lines) {
    const trimmed = line.trim()
    // Skip empty lines, headings, and code blocks
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('```') || trimmed.startsWith('---')) {
      if (paragraph) break // End of paragraph
      continue
    }
    paragraph += (paragraph ? ' ' : '') + trimmed
    if (paragraph.length > 200) break
  }

  // Truncate if too long
  if (paragraph.length > 200) {
    paragraph = paragraph.slice(0, 197) + '...'
  }

  return paragraph || 'No description available'
}

export function SkillPickerModal({
  isOpen,
  onClose,
  repoName,
  skillFiles,
  onImport,
}: SkillPickerModalProps) {
  const [importingPath, setImportingPath] = useState<string | null>(null)
  const [importedPaths, setImportedPaths] = useState<Set<string>>(new Set())
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [isBatchImporting, setIsBatchImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previews, setPreviews] = useState<Record<string, SkillPreview>>({})

  // Filter out README files - only show actual skills
  const filteredSkillFiles = skillFiles.filter((f) => f.type === 'skill')

  // Fetch previews for all skill files
  useEffect(() => {
    if (!isOpen || filteredSkillFiles.length === 0) return

    const fetchPreviews = async () => {
      for (const file of filteredSkillFiles) {
        if (previews[file.path]) continue // Already fetched

        setPreviews((prev) => ({
          ...prev,
          [file.path]: { name: file.name, description: '', loading: true },
        }))

        try {
          const response = await fetch(file.rawUrl)
          if (response.ok) {
            const content = await response.text()
            const { name, description } = parseSkillPreview(content, file.name)
            setPreviews((prev) => ({
              ...prev,
              [file.path]: { name, description, loading: false },
            }))
          } else {
            setPreviews((prev) => ({
              ...prev,
              [file.path]: { name: file.name, description: 'Could not load preview', loading: false, error: 'Failed to fetch' },
            }))
          }
        } catch {
          setPreviews((prev) => ({
            ...prev,
            [file.path]: { name: file.name, description: 'Could not load preview', loading: false, error: 'Network error' },
          }))
        }
      }
    }

    fetchPreviews()
  }, [isOpen, filteredSkillFiles, previews])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setImportedPaths(new Set())
      setSelectedPaths(new Set())
      setError(null)
      setPreviews({})
      setIsBatchImporting(false)
    }
  }, [isOpen])

  // Toggle selection for a single file
  const toggleSelection = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  // Select all unimported files
  const selectAll = () => {
    const unimportedPaths = filteredSkillFiles
      .filter((f) => !importedPaths.has(f.path))
      .map((f) => f.path)
    setSelectedPaths(new Set(unimportedPaths))
  }

  // Deselect all
  const deselectAll = () => {
    setSelectedPaths(new Set())
  }

  // Batch import selected files
  const handleBatchImport = async () => {
    if (selectedPaths.size === 0) return

    setIsBatchImporting(true)
    setError(null)

    const filesToImport = filteredSkillFiles.filter((f) => selectedPaths.has(f.path))

    for (const file of filesToImport) {
      setImportingPath(file.path)
      try {
        await onImport(file)
        setImportedPaths((prev) => new Set([...prev, file.path]))
        setSelectedPaths((prev) => {
          const next = new Set(prev)
          next.delete(file.path)
          return next
        })
      } catch (err) {
        setError(`Failed to import ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
        break // Stop on first error
      }
    }

    setImportingPath(null)
    setIsBatchImporting(false)
  }

  const getFileIcon = (file: RepoSkillFile) => {
    if (file.path.includes('/')) return <FolderOpen size={18} className="text-yellow-500" />
    return <FileText size={18} className="text-green-500" />
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/50"
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-lg bg-white dark:bg-surface-800 rounded-xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200 dark:border-surface-700">
            <div>
              <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
                Select Skills to Import
              </h2>
              <p className="text-sm text-surface-500 mt-0.5">
                Found {filteredSkillFiles.length} skill{filteredSkillFiles.length !== 1 ? 's' : ''} in {repoName}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors"
            >
              <X size={20} className="text-surface-500" />
            </button>
          </div>

          {/* Selection Controls */}
          <div className="flex items-center gap-3 px-6 py-3 bg-surface-50 dark:bg-surface-900 border-b border-surface-200 dark:border-surface-700">
            <button
              onClick={selectAll}
              disabled={isBatchImporting}
              className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium disabled:opacity-50"
            >
              Select All
            </button>
            <span className="text-surface-300 dark:text-surface-600">|</span>
            <button
              onClick={deselectAll}
              disabled={isBatchImporting}
              className="text-sm text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 font-medium disabled:opacity-50"
            >
              Deselect All
            </button>
            {selectedPaths.size > 0 && (
              <span className="ml-auto text-sm text-surface-500">
                {selectedPaths.size} selected
              </span>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="mx-6 mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* File List */}
          <div className="max-h-[400px] overflow-y-auto p-4">
            <div className="space-y-3">
              {filteredSkillFiles.map((file) => {
                const isImporting = importingPath === file.path
                const isImported = importedPaths.has(file.path)
                const isSelected = selectedPaths.has(file.path)
                const preview = previews[file.path]

                return (
                  <div
                    key={file.path}
                    onClick={() => !isImported && !isBatchImporting && toggleSelection(file.path)}
                    className={`p-4 rounded-lg border transition-colors cursor-pointer ${
                      isImported
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 cursor-default'
                        : isSelected
                        ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700'
                        : 'bg-surface-50 dark:bg-surface-900 border-surface-200 dark:border-surface-700 hover:border-primary-300 dark:hover:border-primary-700'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Checkbox */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (!isImported && !isBatchImporting) toggleSelection(file.path)
                        }}
                        disabled={isImported || isBatchImporting}
                        className="flex-shrink-0 mt-0.5"
                      >
                        {isImported ? (
                          <CheckCircle size={20} className="text-green-500" />
                        ) : isSelected ? (
                          <CheckSquare size={20} className="text-primary-600 dark:text-primary-400" />
                        ) : (
                          <Square size={20} className="text-surface-400" />
                        )}
                      </button>

                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="mt-0.5">{getFileIcon(file)}</div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-surface-900 dark:text-surface-100">
                            {preview?.loading ? file.name : preview?.name || file.name}
                          </p>
                          <p className="text-xs text-surface-400 mb-2">{file.path}</p>
                          {preview?.loading ? (
                            <div className="flex items-center gap-2 text-sm text-surface-400">
                              <Loader2 size={14} className="animate-spin" />
                              Loading description...
                            </div>
                          ) : preview?.description ? (
                            <p className="text-sm text-surface-600 dark:text-surface-400 line-clamp-2">
                              {preview.description}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      {/* Status indicator */}
                      {isImporting && (
                        <div className="flex-shrink-0 flex items-center gap-2 text-sm text-surface-500">
                          <Loader2 size={16} className="animate-spin" />
                          Importing...
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900">
            <p className="text-sm text-surface-500">
              {importedPaths.size > 0
                ? `${importedPaths.size} skill${importedPaths.size > 1 ? 's' : ''} imported`
                : 'Click to select, then import'}
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                disabled={isBatchImporting}
                className="px-4 py-2 bg-surface-200 dark:bg-surface-700 hover:bg-surface-300 dark:hover:bg-surface-600 text-surface-700 dark:text-surface-300 font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {importedPaths.size > 0 ? 'Done' : 'Cancel'}
              </button>
              {selectedPaths.size > 0 && (
                <button
                  onClick={handleBatchImport}
                  disabled={isBatchImporting}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 disabled:bg-primary-400 text-white font-medium rounded-lg transition-colors"
                >
                  {isBatchImporting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Download size={16} />
                      Import {selectedPaths.size} Selected
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
