// Edit Task Modal - Form for editing existing tasks

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Calendar, AlertTriangle } from 'lucide-react'
import type { Task, TaskPriority } from '@/types/agentpm'

interface EditTaskModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (updates: {
    title: string
    description?: string
    priority: TaskPriority
    dueAt?: string
  }) => Promise<void>
  task: Task
}

export function EditTaskModal({
  isOpen,
  onClose,
  onSubmit,
  task,
}: EditTaskModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [dueAt, setDueAt] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initialize form with task data when modal opens
  useEffect(() => {
    if (isOpen && task) {
      setTitle(task.title)
      setDescription(task.description || '')
      setPriority(task.priority)
      setDueAt(task.dueAt ? task.dueAt.split('T')[0] : '')
    }
  }, [isOpen, task])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setError('Title is required')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        dueAt: dueAt || undefined,
      })
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update task')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    setError(null)
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

          {/* Modal Container - Flexbox centering */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="w-full max-w-lg max-h-[90vh] bg-white dark:bg-surface-800 rounded-xl shadow-xl flex flex-col overflow-hidden pointer-events-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-surface-200 dark:border-surface-700 flex-shrink-0">
              <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
                Edit Task
              </h2>
              <button
                onClick={handleClose}
                className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-500 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-auto p-4 space-y-4">
              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
                  <AlertTriangle size={16} />
                  {error}
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What needs to be done?"
                  className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
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
                  placeholder="Add more details..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                />
              </div>

              {/* Priority & Due Date */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                    Priority
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as TaskPriority)}
                    className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                    Due Date
                  </label>
                  <div className="relative">
                    <label
                      htmlFor="edit-due-date-input"
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 cursor-pointer hover:text-surface-600 dark:hover:text-surface-300 transition-colors"
                    >
                      <Calendar size={16} />
                    </label>
                    <input
                      id="edit-due-date-input"
                      type="date"
                      value={dueAt}
                      onChange={(e) => setDueAt(e.target.value)}
                      className="w-full pl-10 pr-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:dark:invert"
                    />
                  </div>
                </div>
              </div>

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
                  disabled={isSubmitting || !title.trim()}
                  className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
