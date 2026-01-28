// PushToTaskModal - Convert a note to a task with optional attachment transfer
import { useState, useEffect, useCallback } from 'react'
import {
  X,
  ArrowRightCircle,
  Loader2,
  Check,
  AlertCircle,
  Paperclip,
  FolderKanban,
} from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import { useAccountStore } from '@/stores/accountStore'
import { useAuthStore } from '@/stores/authStore'
import { createTaskFromNote } from '@/services/tasks/taskFromNote'
import type { Note } from '@/types/index'
import type { Attachment } from '@/services/attachments/attachmentService'
import type { Task, TaskPriority } from '@/types/agentpm'

interface PushToTaskModalProps {
  isOpen: boolean
  onClose: () => void
  note: Note
  attachments: Attachment[]
  onTaskCreated?: (task: Task) => void
}

const PRIORITY_OPTIONS: { value: TaskPriority; label: string; color: string }[] = [
  { value: 'critical', label: 'Critical', color: '#ef4444' },
  { value: 'high', label: 'High', color: '#f97316' },
  { value: 'medium', label: 'Medium', color: '#eab308' },
  { value: 'low', label: 'Low', color: '#22c55e' },
]

export function PushToTaskModal({
  isOpen,
  onClose,
  note,
  attachments,
  onTaskCreated,
}: PushToTaskModalProps) {
  const { currentAccountId } = useAccountStore()
  const { user } = useAuthStore()
  const { projects } = useProjectStore()

  const [title, setTitle] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [includeAttachments, setIncludeAttachments] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setTitle(note.title !== 'Untitled' ? note.title : '')
      setSelectedProjectId(null)
      setPriority('medium')
      setIncludeAttachments(true)
      setError(null)
      setSuccess(false)
    }
  }, [isOpen, note.title])

  const handleCreate = useCallback(async () => {
    if (!currentAccountId || !user?.id) {
      setError('Account not configured')
      return
    }

    if (!title.trim()) {
      setError('Please enter a task title')
      return
    }

    setIsCreating(true)
    setError(null)

    try {
      const task = await createTaskFromNote({
        accountId: currentAccountId,
        userId: user.id,
        note,
        taskData: {
          title: title.trim(),
          projectId: selectedProjectId || undefined,
          priority,
          status: 'draft',
        },
        includeAttachments,
        attachments: includeAttachments ? attachments : [],
      })

      if (task) {
        setSuccess(true)
        onTaskCreated?.(task)
        // Close after a short delay to show success
        setTimeout(() => {
          onClose()
        }, 1500)
      } else {
        setError('Failed to create task')
      }
    } catch (err) {
      console.error('[PushToTaskModal] Creation error:', err)
      setError(err instanceof Error ? err.message : 'Failed to create task')
    } finally {
      setIsCreating(false)
    }
  }, [
    currentAccountId,
    user?.id,
    note,
    title,
    selectedProjectId,
    priority,
    includeAttachments,
    attachments,
    onTaskCreated,
    onClose,
  ])

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
            <ArrowRightCircle size={20} style={{ color: '#0ea5e9' }} />
            <h2
              className="text-lg font-medium"
              style={{ color: 'var(--fl-color-text-primary)' }}
            >
              Push to Task
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            disabled={isCreating}
          >
            <X size={18} style={{ color: 'var(--fl-color-text-muted)' }} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {/* Task Title */}
          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: 'var(--fl-color-text-primary)' }}
            >
              Task Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter task title..."
              disabled={isCreating}
              className="w-full px-3 py-2 rounded-lg text-sm transition-colors"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--fl-color-border)',
                color: 'var(--fl-color-text-primary)',
              }}
            />
          </div>

          {/* Project Selection */}
          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: 'var(--fl-color-text-primary)' }}
            >
              Project (Optional)
            </label>
            <div className="relative">
              <FolderKanban
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--fl-color-text-muted)' }}
              />
              <select
                value={selectedProjectId || ''}
                onChange={(e) => setSelectedProjectId(e.target.value || null)}
                disabled={isCreating}
                className="w-full pl-10 pr-3 py-2 rounded-lg text-sm transition-colors appearance-none"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--fl-color-border)',
                  color: 'var(--fl-color-text-primary)',
                }}
              >
                <option value="">No project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Priority */}
          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: 'var(--fl-color-text-primary)' }}
            >
              Priority
            </label>
            <div className="flex gap-2">
              {PRIORITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setPriority(option.value)}
                  disabled={isCreating}
                  className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    priority === option.value ? 'ring-2' : ''
                  }`}
                  style={{
                    background:
                      priority === option.value
                        ? `${option.color}20`
                        : 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid',
                    borderColor:
                      priority === option.value
                        ? option.color
                        : 'var(--fl-color-border)',
                    color:
                      priority === option.value
                        ? option.color
                        : 'var(--fl-color-text-muted)',
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Include Attachments */}
          {attachments.length > 0 && (
            <div
              className="p-3 rounded-lg"
              style={{ background: 'rgba(255, 255, 255, 0.03)' }}
            >
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeAttachments}
                  onChange={(e) => setIncludeAttachments(e.target.checked)}
                  disabled={isCreating}
                  className="w-4 h-4 rounded"
                />
                <div className="flex items-center gap-2">
                  <Paperclip
                    size={16}
                    style={{ color: 'var(--fl-color-text-muted)' }}
                  />
                  <span
                    className="text-sm"
                    style={{ color: 'var(--fl-color-text-primary)' }}
                  >
                    Include {attachments.length} attachment
                    {attachments.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </label>
              {includeAttachments && (
                <div className="mt-2 ml-7 space-y-1">
                  {attachments.slice(0, 3).map((attachment) => (
                    <div
                      key={attachment.id}
                      className="text-xs truncate"
                      style={{ color: 'var(--fl-color-text-muted)' }}
                    >
                      {attachment.fileName}
                    </div>
                  ))}
                  {attachments.length > 3 && (
                    <div
                      className="text-xs"
                      style={{ color: 'var(--fl-color-text-muted)' }}
                    >
                      +{attachments.length - 3} more
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

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
              style={{
                background: 'rgba(34, 197, 94, 0.15)',
                color: '#22c55e',
              }}
            >
              <Check size={16} />
              <span className="text-sm">Task created successfully!</span>
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
            disabled={isCreating}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-white/10"
            style={{ color: 'var(--fl-color-text-muted)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isCreating || success || !title.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            style={{
              background: '#0ea5e9',
              color: 'white',
            }}
          >
            {isCreating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Creating...
              </>
            ) : success ? (
              <>
                <Check size={16} />
                Done
              </>
            ) : (
              <>
                <ArrowRightCircle size={16} />
                Create Task
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
