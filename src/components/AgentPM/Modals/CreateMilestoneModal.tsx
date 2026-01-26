// Create/Edit Task List Modal - Form for creating or editing task lists (milestones/sprints)

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Target, Calendar, Clock, RotateCcw } from 'lucide-react'
import type { MilestoneStatus, Milestone, ScheduleType, MilestoneSchedule } from '@/types/agentpm'

interface CreateMilestoneModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (milestone: {
    name: string
    description?: string
    status: MilestoneStatus
    dueDate?: string
    sortOrder: number
    schedule?: MilestoneSchedule
    isScheduleActive?: boolean
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

  // Schedule fields
  const [scheduleType, setScheduleType] = useState<ScheduleType>('none')
  const [scheduleHour, setScheduleHour] = useState(22) // Default 10 PM
  const [scheduleDayOfWeek, setScheduleDayOfWeek] = useState(0) // Sunday
  const [scheduleDayOfMonth, setScheduleDayOfMonth] = useState(1)
  const [scheduleRunDate, setScheduleRunDate] = useState('')
  const [scheduleEndDate, setScheduleEndDate] = useState('')
  const [isScheduleActive, setIsScheduleActive] = useState(false)

  const isEditing = !!editingMilestone

  // Populate form when editing
  useEffect(() => {
    if (editingMilestone) {
      setName(editingMilestone.name)
      setDescription(editingMilestone.description || '')
      setStatus(editingMilestone.status)
      setDueDate(editingMilestone.dueDate || '')
      // Schedule fields
      setScheduleType(editingMilestone.schedule?.type || 'none')
      setScheduleHour(editingMilestone.schedule?.hour ?? 22)
      setScheduleDayOfWeek(editingMilestone.schedule?.dayOfWeek ?? 0)
      setScheduleDayOfMonth(editingMilestone.schedule?.dayOfMonth ?? 1)
      setScheduleRunDate(editingMilestone.schedule?.runDate || '')
      setScheduleEndDate(editingMilestone.schedule?.endDate || '')
      setIsScheduleActive(editingMilestone.isScheduleActive || false)
    } else {
      // Reset to defaults when creating new
      setName('')
      setDescription('')
      setStatus('not_started')
      setDueDate('')
      // Reset schedule fields
      setScheduleType('none')
      setScheduleHour(22)
      setScheduleDayOfWeek(0)
      setScheduleDayOfMonth(1)
      setScheduleRunDate('')
      setScheduleEndDate('')
      setIsScheduleActive(false)
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
      // Build schedule object if scheduling is enabled
      const schedule: MilestoneSchedule | undefined = scheduleType !== 'none' ? {
        type: scheduleType,
        hour: scheduleHour,
        ...(scheduleType === 'weekly' && { dayOfWeek: scheduleDayOfWeek }),
        ...(scheduleType === 'monthly' && { dayOfMonth: scheduleDayOfMonth }),
        ...(scheduleType === 'once' && scheduleRunDate && { runDate: scheduleRunDate }),
        ...(scheduleEndDate && { endDate: scheduleEndDate }),
      } : undefined

      if (isEditing && onUpdate) {
        await onUpdate(editingMilestone.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          status,
          dueDate: dueDate || undefined,
          schedule,
          isScheduleActive: scheduleType !== 'none' ? isScheduleActive : false,
        })
      } else {
        await onSubmit({
          name: name.trim(),
          description: description.trim() || undefined,
          status,
          dueDate: dueDate || undefined,
          sortOrder: existingMilestonesCount + 1,
          schedule,
          isScheduleActive: scheduleType !== 'none' ? isScheduleActive : false,
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
    // Reset schedule fields
    setScheduleType('none')
    setScheduleHour(22)
    setScheduleDayOfWeek(0)
    setScheduleDayOfMonth(1)
    setScheduleRunDate('')
    setScheduleEndDate('')
    setIsScheduleActive(false)
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

              {/* Schedule Section */}
              <div className="border-t border-surface-200 dark:border-surface-700 pt-4 mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <RotateCcw size={16} className="text-surface-500" />
                  <span className="text-sm font-medium text-surface-700 dark:text-surface-300">
                    Schedule
                  </span>
                  <span className="text-xs text-surface-400">(Optional)</span>
                </div>

                {/* Schedule Type */}
                <div className="mb-3">
                  <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                    Schedule Type
                  </label>
                  <select
                    value={scheduleType}
                    onChange={(e) => setScheduleType(e.target.value as ScheduleType)}
                    className="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="none">No Schedule</option>
                    <option value="once">One-Time</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>

                {/* Schedule Details - shown when schedule type is not 'none' */}
                {scheduleType !== 'none' && (
                  <div className="space-y-3 p-3 bg-surface-50 dark:bg-surface-900 rounded-lg">
                    {/* One-time: Run Date */}
                    {scheduleType === 'once' && (
                      <div>
                        <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                          <Calendar size={14} className="inline mr-1" />
                          Run Date
                        </label>
                        <input
                          type="date"
                          value={scheduleRunDate}
                          onChange={(e) => setScheduleRunDate(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                    )}

                    {/* Hour of day */}
                    <div>
                      <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                        <Clock size={14} className="inline mr-1" />
                        Time (Hour)
                      </label>
                      <select
                        value={scheduleHour}
                        onChange={(e) => setScheduleHour(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        {Array.from({ length: 24 }, (_, i) => (
                          <option key={i} value={i}>
                            {i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Weekly: Day of Week */}
                    {scheduleType === 'weekly' && (
                      <div>
                        <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                          Day of Week
                        </label>
                        <select
                          value={scheduleDayOfWeek}
                          onChange={(e) => setScheduleDayOfWeek(Number(e.target.value))}
                          className="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                          <option value={0}>Sunday</option>
                          <option value={1}>Monday</option>
                          <option value={2}>Tuesday</option>
                          <option value={3}>Wednesday</option>
                          <option value={4}>Thursday</option>
                          <option value={5}>Friday</option>
                          <option value={6}>Saturday</option>
                        </select>
                      </div>
                    )}

                    {/* Monthly: Day of Month */}
                    {scheduleType === 'monthly' && (
                      <div>
                        <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                          Day of Month
                        </label>
                        <select
                          value={scheduleDayOfMonth}
                          onChange={(e) => setScheduleDayOfMonth(Number(e.target.value))}
                          className="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                          {Array.from({ length: 28 }, (_, i) => (
                            <option key={i + 1} value={i + 1}>
                              {i + 1}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-surface-400 mt-1">
                          Days 29-31 not available to ensure consistency
                        </p>
                      </div>
                    )}

                    {/* End Date (for recurring) */}
                    {scheduleType !== 'once' && (
                      <div>
                        <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                          <Calendar size={14} className="inline mr-1" />
                          End Date (Optional)
                        </label>
                        <input
                          type="date"
                          value={scheduleEndDate}
                          onChange={(e) => setScheduleEndDate(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                    )}

                    {/* Active Toggle */}
                    <div className="flex items-center justify-between pt-2 border-t border-surface-200 dark:border-surface-700">
                      <span className="text-sm font-medium text-surface-700 dark:text-surface-300">
                        Schedule Active
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsScheduleActive(!isScheduleActive)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          isScheduleActive ? 'bg-primary-600' : 'bg-surface-300 dark:bg-surface-600'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            isScheduleActive ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                )}
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
