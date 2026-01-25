// Create/Edit Task List Modal - Form for creating or editing task lists (milestones/sprints)

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Target, Calendar } from 'lucide-react'
import type { MilestoneStatus, Milestone } from '@/types/agentpm'

interface CreateMilestoneModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (milestone: {
    name: string
    description?: string
    status: MilestoneStatus
    dueDate?: string
    sortOrder: number
  }) => Promise<void>
  onUpdate?: (id: string, updates: Partial<Milestone>) => Promise<void>
  existingMilestonesCount: number
  editingMilestone?: Milestone | null
}

export function CreateMilestoneModal({
  isOpen,
  onClose,
  onSubmit,
  onUpdate,
  existingMilestonesCount,
  editingMilestone,
}: CreateMilestoneModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<MilestoneStatus>('not_started')
  const [dueDate, setDueDate] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditing = !!editingMilestone

  // Populate form when editing
  useEffect(() => {
    if (editingMilestone) {
      setName(editingMilestone.name)
      setDescription(editingMilestone.description || '')
      setStatus(editingMilestone.status)
      setDueDate(editingMilestone.dueDate || '')
    } else {
      // Reset to defaults when creating new
      setName('')
      setDescription('')
      setStatus('not_started')
      setDueDate('')
    }
  }, [editingMilestone])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Name is required')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      if (isEditing && onUpdate) {
        await onUpdate(editingMilestone.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          status,
          dueDate: dueDate || undefined,
        })
      } else {
        await onSubmit({
          name: name.trim(),
          description: description.trim() || undefined,
          status,
          dueDate: dueDate || undefined,
          sortOrder: existingMilestonesCount + 1,
        })
      }
      handleClose()
    } catch (err) {
      console.error('Milestone save error:', err)
      const errorMessage = err instanceof Error ? err.message : `Failed to ${isEditing ? 'update' : 'create'} task list`
      setError(errorMessage)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    setName('')
    setDescription('')
    setStatus('not_started')
    setDueDate('')
    setError(null)
    onClose()
  }

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
                <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <Target className="text-amber-600 dark:text-amber-400" size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
                    {isEditing ? 'Edit Task List' : 'Create Task List'}
                  </h2>
                  <p className="text-sm text-surface-500">
                    {isEditing ? 'Update task list details' : 'Add a task list to organize tasks into milestones or sprints'}
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

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Sprint 1, Phase 1, MVP..."
                  className="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  autoFocus
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What will be delivered in this milestone..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                />
              </div>

              {/* Status & Due Date */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                    Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as MilestoneStatus)}
                    className="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="not_started">Not Started</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                    <Calendar size={14} className="inline mr-1" />
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
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
                  disabled={isSubmitting || !name.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:bg-surface-300 disabled:text-surface-500 rounded-lg transition-colors"
                >
                  {isSubmitting
                    ? (isEditing ? 'Saving...' : 'Creating...')
                    : (isEditing ? 'Save Changes' : 'Create Task List')}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
