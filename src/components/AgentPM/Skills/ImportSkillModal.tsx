// Import Skill Modal - Import skills from GitHub or raw content

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Github, FileText, AlertTriangle, Loader2 } from 'lucide-react'

interface ImportSkillModalProps {
  isOpen: boolean
  onClose: () => void
  onImportGitHub: (url: string) => Promise<void>
  onImportRaw: (content: string, name?: string) => Promise<void>
}

type ImportTab = 'github' | 'raw'

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
      } else {
        if (!rawContent.trim()) {
          setError('Please enter skill content')
          return
        }
        await onImportRaw(rawContent.trim(), rawName.trim() || undefined)
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

              {activeTab === 'github' ? (
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
              ) : (
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
