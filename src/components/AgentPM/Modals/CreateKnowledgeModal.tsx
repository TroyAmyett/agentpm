// Create/Edit Knowledge Modal - Form for adding or editing knowledge entries

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, BookOpen, Lightbulb, CheckCircle, AlertTriangle, Link2, BookMarked } from 'lucide-react'
import type { KnowledgeType, KnowledgeEntry } from '@/types/agentpm'

interface CreateKnowledgeModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (entry: {
    knowledgeType: KnowledgeType
    content: string
    isVerified: boolean
  }) => Promise<void>
  onUpdate?: (id: string, updates: Partial<KnowledgeEntry>) => Promise<void>
  editingEntry?: KnowledgeEntry | null
}

const knowledgeTypes: { value: KnowledgeType; label: string; icon: React.ReactNode; description: string }[] = [
  {
    value: 'fact',
    label: 'Fact',
    icon: <Lightbulb size={16} />,
    description: 'A truth about the project (e.g., "API uses REST")',
  },
  {
    value: 'decision',
    label: 'Decision',
    icon: <CheckCircle size={16} />,
    description: 'A choice that was made (e.g., "We chose Tailwind")',
  },
  {
    value: 'constraint',
    label: 'Constraint',
    icon: <AlertTriangle size={16} />,
    description: 'A limitation to work within (e.g., "Must support IE11")',
  },
  {
    value: 'reference',
    label: 'Reference',
    icon: <Link2 size={16} />,
    description: 'A link to documentation or resource',
  },
  {
    value: 'glossary',
    label: 'Glossary',
    icon: <BookMarked size={16} />,
    description: 'A term definition (e.g., "PRD = Product Requirements Doc")',
  },
]

export function CreateKnowledgeModal({
  isOpen,
  onClose,
  onSubmit,
  onUpdate,
  editingEntry,
}: CreateKnowledgeModalProps) {
  const [knowledgeType, setKnowledgeType] = useState<KnowledgeType>('fact')
  const [content, setContent] = useState('')
  const [isVerified, setIsVerified] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditing = !!editingEntry

  // Populate form when editing
  useEffect(() => {
    if (editingEntry) {
      setKnowledgeType(editingEntry.knowledgeType)
      setContent(editingEntry.content)
      setIsVerified(editingEntry.isVerified)
    } else {
      // Reset to defaults when creating new
      setKnowledgeType('fact')
      setContent('')
      setIsVerified(true)
    }
  }, [editingEntry])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) {
      setError('Content is required')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      if (isEditing && onUpdate) {
        await onUpdate(editingEntry.id, {
          knowledgeType,
          content: content.trim(),
          isVerified,
        })
      } else {
        await onSubmit({
          knowledgeType,
          content: content.trim(),
          isVerified,
        })
      }
      handleClose()
    } catch (err) {
      console.error('Knowledge save error:', err)
      const errorMessage = err instanceof Error ? err.message : `Failed to ${isEditing ? 'update' : 'create'} entry`
      setError(errorMessage)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    setKnowledgeType('fact')
    setContent('')
    setIsVerified(true)
    setError(null)
    onClose()
  }

  const selectedType = knowledgeTypes.find(t => t.value === knowledgeType)

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50"
            onClick={handleClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-lg bg-white dark:bg-surface-800 rounded-xl shadow-xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-surface-200 dark:border-surface-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <BookOpen className="text-purple-600 dark:text-purple-400" size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
                    {isEditing ? 'Edit Knowledge Entry' : 'Add Knowledge Entry'}
                  </h2>
                  <p className="text-sm text-surface-500">
                    {isEditing ? 'Update entry details' : 'Record facts, decisions, or constraints'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-500 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* Knowledge Type */}
              <div>
                <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-2">
                  Type
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {knowledgeTypes.map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setKnowledgeType(type.value)}
                      className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors ${
                        knowledgeType === type.value
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                          : 'border-surface-200 dark:border-surface-600 hover:bg-surface-50 dark:hover:bg-surface-700 text-surface-600 dark:text-surface-400'
                      }`}
                      title={type.description}
                    >
                      {type.icon}
                      <span className="text-xs font-medium">{type.label}</span>
                    </button>
                  ))}
                </div>
                {selectedType && (
                  <p className="text-xs text-surface-500 mt-2">{selectedType.description}</p>
                )}
              </div>

              {/* Content */}
              <div>
                <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                  Content *
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={
                    knowledgeType === 'fact' ? 'The API uses REST with JSON responses...' :
                    knowledgeType === 'decision' ? 'We chose React over Vue because...' :
                    knowledgeType === 'constraint' ? 'All pages must load within 3 seconds...' :
                    knowledgeType === 'reference' ? 'Design specs are at https://figma.com/...' :
                    'PRD = Product Requirements Document'
                  }
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                  autoFocus
                />
              </div>

              {/* Verified Toggle */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsVerified(!isVerified)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    isVerified
                      ? 'bg-green-500'
                      : 'bg-surface-300 dark:bg-surface-600'
                  }`}
                >
                  <div
                    className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      isVerified ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
                <span className="text-sm text-surface-700 dark:text-surface-300">
                  {isVerified ? 'Verified' : 'Unverified'}
                  <span className="text-surface-500 ml-1">
                    ({isVerified ? 'ready for AI use' : 'needs confirmation'})
                  </span>
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-surface-200 dark:border-surface-700">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 text-sm font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !content.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:bg-surface-300 disabled:text-surface-500 rounded-lg transition-colors"
                >
                  {isSubmitting
                    ? (isEditing ? 'Saving...' : 'Adding...')
                    : (isEditing ? 'Save Changes' : 'Add Entry')}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
