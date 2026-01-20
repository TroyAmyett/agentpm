// Import Skill Modal - Import skills from GitHub, raw content, or file upload

import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Github, FileText, Upload, AlertTriangle, Loader2, File } from 'lucide-react'

interface ImportSkillModalProps {
  isOpen: boolean
  onClose: () => void
  onImportGitHub: (url: string) => Promise<void>
  onImportRaw: (content: string, name?: string) => Promise<void>
}

type ImportTab = 'github' | 'raw' | 'upload'

export function ImportSkillModal({
  isOpen,
  onClose,
  onImportGitHub,
  onImportRaw,
}: ImportSkillModalProps) {
  const [activeTab, setActiveTab] = useState<ImportTab>('github')
  const [githubUrl, setGithubUrl] = useState('')
  const [rawContent, setRawContent] = useState('')
  const [rawName, setRawName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // File upload state
  const [selectedFile, setSelectedFile] = useState<globalThis.File | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Handle file selection
  const handleFileSelect = useCallback((file: globalThis.File) => {
    if (!file.name.endsWith('.md')) {
      setError('Please select a .md file')
      return
    }
    if (file.size > 1024 * 1024) { // 1MB limit
      setError('File size must be less than 1MB')
      return
    }

    setSelectedFile(file)
    setError(null)

    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      setFileContent(content)
    }
    reader.onerror = () => {
      setError('Failed to read file')
      setSelectedFile(null)
    }
    reader.readAsText(file)
  }, [])

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleFileSelect(files[0])
    }
  }, [handleFileSelect])

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFileSelect(files[0])
    }
  }, [handleFileSelect])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      if (activeTab === 'github') {
        if (!githubUrl.trim()) {
          setError('Please enter a GitHub URL')
          return
        }
        await onImportGitHub(githubUrl.trim())
      } else if (activeTab === 'raw') {
        if (!rawContent.trim()) {
          setError('Please enter skill content')
          return
        }
        await onImportRaw(rawContent.trim(), rawName.trim() || undefined)
      } else if (activeTab === 'upload') {
        if (!fileContent) {
          setError('Please select a file')
          return
        }
        // Extract name from filename (without .md extension)
        const fileName = selectedFile?.name.replace(/\.md$/, '') || undefined
        await onImportRaw(fileContent, fileName)
      }
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import skill')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    setGithubUrl('')
    setRawContent('')
    setRawName('')
    setSelectedFile(null)
    setFileContent(null)
    setIsDragging(false)
    setError(null)
    setActiveTab('github')
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/50 z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white dark:bg-surface-800 rounded-xl shadow-xl z-50"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-surface-200 dark:border-surface-700">
              <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
                Import Skill
              </h2>
              <button
                onClick={handleClose}
                className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-500 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-surface-200 dark:border-surface-700">
              <button
                onClick={() => setActiveTab('github')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'github'
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100'
                }`}
              >
                <Github size={18} />
                GitHub URL
              </button>
              <button
                onClick={() => setActiveTab('raw')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'raw'
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100'
                }`}
              >
                <FileText size={18} />
                Raw Content
              </button>
              <button
                onClick={() => setActiveTab('upload')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'upload'
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100'
                }`}
              >
                <Upload size={18} />
                Upload File
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
                  <AlertTriangle size={16} />
                  {error}
                </div>
              )}

              {activeTab === 'github' && (
                <>
                  {/* GitHub URL */}
                  <div>
                    <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                      GitHub URL
                    </label>
                    <input
                      type="url"
                      value={githubUrl}
                      onChange={(e) => setGithubUrl(e.target.value)}
                      placeholder="https://github.com/user/repo/blob/main/skill.md"
                      className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      autoFocus
                    />
                    <p className="mt-1.5 text-xs text-surface-500">
                      Paste a link to a .md file on GitHub (blob or raw URL)
                    </p>
                  </div>
                </>
              )}

              {activeTab === 'raw' && (
                <>
                  {/* Skill Name */}
                  <div>
                    <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                      Skill Name
                    </label>
                    <input
                      type="text"
                      value={rawName}
                      onChange={(e) => setRawName(e.target.value)}
                      placeholder="My Custom Skill"
                      className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      autoFocus
                    />
                    <p className="mt-1.5 text-xs text-surface-500">
                      Optional. Will be extracted from frontmatter if present.
                    </p>
                  </div>

                  {/* Raw Content */}
                  <div>
                    <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                      Skill Content
                    </label>
                    <textarea
                      value={rawContent}
                      onChange={(e) => setRawContent(e.target.value)}
                      placeholder={`---
name: My Custom Skill
description: What this skill does
version: 1.0.0
tags: [tag1, tag2]
---

# My Custom Skill

## Instructions
When working on...`}
                      rows={12}
                      className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none font-mono text-sm"
                    />
                  </div>
                </>
              )}

              {activeTab === 'upload' && (
                <>
                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".md"
                    onChange={handleFileInputChange}
                    className="hidden"
                  />

                  {/* Drop zone */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                      isDragging
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                        : selectedFile
                        ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                        : 'border-surface-300 dark:border-surface-600 hover:border-primary-400 hover:bg-surface-50 dark:hover:bg-surface-800'
                    }`}
                  >
                    {selectedFile ? (
                      <>
                        <File size={32} className="text-green-500" />
                        <div className="text-center">
                          <p className="font-medium text-surface-900 dark:text-surface-100">
                            {selectedFile.name}
                          </p>
                          <p className="text-xs text-surface-500 mt-1">
                            {(selectedFile.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedFile(null)
                            setFileContent(null)
                            if (fileInputRef.current) {
                              fileInputRef.current.value = ''
                            }
                          }}
                          className="text-xs text-surface-500 hover:text-red-500 underline"
                        >
                          Remove file
                        </button>
                      </>
                    ) : (
                      <>
                        <Upload size={32} className="text-surface-400" />
                        <div className="text-center">
                          <p className="font-medium text-surface-700 dark:text-surface-300">
                            Drop .md file here
                          </p>
                          <p className="text-sm text-surface-500 mt-1">
                            or click to browse
                          </p>
                        </div>
                      </>
                    )}
                  </div>

                  <p className="text-xs text-surface-500">
                    Upload a markdown file with optional YAML frontmatter for metadata (name, description, tags, etc.)
                  </p>
                </>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-surface-200 dark:border-surface-700">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Importing...
                    </>
                  ) : (
                    'Import Skill'
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
