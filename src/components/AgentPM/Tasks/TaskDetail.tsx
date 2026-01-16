// Task Detail - Full task view with status history and actions

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  X,
  Bot,
  User,
  Calendar,
  Clock,
  Play,
  Pause,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Trash2,
  Edit2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import type { Task, TaskStatus, AgentPersona } from '@/types/agentpm'
import { TaskStatusBadge } from './TaskStatusBadge'
import { TaskPriorityBadge } from './TaskPriorityBadge'

interface TaskDetailProps {
  task: Task
  agent?: AgentPersona
  onClose?: () => void
  onUpdateStatus?: (taskId: string, status: TaskStatus, note?: string) => void
  onDelete?: (taskId: string) => void
  onEdit?: (taskId: string) => void
}

export function TaskDetail({
  task,
  agent,
  onClose,
  onUpdateStatus,
  onDelete,
  onEdit,
}: TaskDetailProps) {
  const [showHistory, setShowHistory] = useState(false)
  const [statusNote, setStatusNote] = useState('')

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const getNextActions = (): { status: TaskStatus; label: string; icon: React.ReactNode; color: string }[] => {
    switch (task.status) {
      case 'pending':
        return [
          { status: 'queued', label: 'Queue', icon: <Play size={16} />, color: 'blue' },
          { status: 'cancelled', label: 'Cancel', icon: <XCircle size={16} />, color: 'surface' },
        ]
      case 'queued':
        return [
          { status: 'in_progress', label: 'Start', icon: <Play size={16} />, color: 'yellow' },
          { status: 'pending', label: 'Unqueue', icon: <Pause size={16} />, color: 'surface' },
          { status: 'cancelled', label: 'Cancel', icon: <XCircle size={16} />, color: 'surface' },
        ]
      case 'in_progress':
        return [
          { status: 'review', label: 'Submit for Review', icon: <CheckCircle2 size={16} />, color: 'orange' },
          { status: 'completed', label: 'Complete', icon: <CheckCircle2 size={16} />, color: 'green' },
          { status: 'failed', label: 'Mark Failed', icon: <XCircle size={16} />, color: 'red' },
        ]
      case 'review':
        return [
          { status: 'completed', label: 'Approve', icon: <CheckCircle2 size={16} />, color: 'green' },
          { status: 'in_progress', label: 'Request Changes', icon: <RotateCcw size={16} />, color: 'yellow' },
        ]
      case 'failed':
        return [
          { status: 'pending', label: 'Retry', icon: <RotateCcw size={16} />, color: 'blue' },
        ]
      case 'completed':
      case 'cancelled':
        return [
          { status: 'pending', label: 'Reopen', icon: <RotateCcw size={16} />, color: 'blue' },
        ]
      default:
        return []
    }
  }

  const actionColors: Record<string, string> = {
    blue: 'bg-blue-600 hover:bg-blue-700 text-white',
    yellow: 'bg-yellow-500 hover:bg-yellow-600 text-white',
    orange: 'bg-orange-500 hover:bg-orange-600 text-white',
    green: 'bg-green-600 hover:bg-green-700 text-white',
    red: 'bg-red-600 hover:bg-red-700 text-white',
    surface: 'bg-surface-200 dark:bg-surface-700 hover:bg-surface-300 dark:hover:bg-surface-600 text-surface-700 dark:text-surface-300',
  }

  const handleStatusChange = (status: TaskStatus) => {
    onUpdateStatus?.(task.id, status, statusNote || undefined)
    setStatusNote('')
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="flex flex-col h-full bg-white dark:bg-surface-800 border-l border-surface-200 dark:border-surface-700"
    >
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-surface-200 dark:border-surface-700">
        <h2 className="font-semibold text-surface-900 dark:text-surface-100">Task Details</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit?.(task.id)}
            className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-500 transition-colors"
            title="Edit"
          >
            <Edit2 size={18} />
          </button>
          <button
            onClick={() => onDelete?.(task.id)}
            className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-surface-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            title="Delete"
          >
            <Trash2 size={18} />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-500 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Title & Description */}
        <div>
          <h3 className="text-lg font-medium text-surface-900 dark:text-surface-100 mb-2">
            {task.title}
          </h3>
          {task.description && (
            <p className="text-surface-600 dark:text-surface-400">{task.description}</p>
          )}
        </div>

        {/* Badges */}
        <div className="flex items-center gap-3">
          <TaskStatusBadge status={task.status} size="lg" />
          <TaskPriorityBadge priority={task.priority} size="lg" />
        </div>

        {/* Assignee */}
        <div className="p-4 rounded-lg bg-surface-50 dark:bg-surface-900/50">
          <h4 className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-2">
            Assigned To
          </h4>
          {task.assignedTo ? (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                {task.assignedToType === 'agent' ? (
                  <Bot className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                ) : (
                  <User className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                )}
              </div>
              <div>
                <p className="font-medium text-surface-900 dark:text-surface-100">
                  {agent?.alias || 'Unknown'}
                </p>
                <p className="text-xs text-surface-500 dark:text-surface-400">
                  {task.assignedToType === 'agent' ? agent?.agentType : 'User'}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-surface-500 dark:text-surface-400">Unassigned</p>
          )}
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h4 className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-1">
              Due Date
            </h4>
            <div className="flex items-center gap-2 text-surface-900 dark:text-surface-100">
              <Calendar size={16} className="text-surface-400" />
              {formatDate(task.dueAt)}
            </div>
          </div>
          <div>
            <h4 className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-1">
              Created
            </h4>
            <div className="flex items-center gap-2 text-surface-900 dark:text-surface-100">
              <Clock size={16} className="text-surface-400" />
              {formatDate(task.createdAt)}
            </div>
          </div>
        </div>

        {/* Output */}
        {task.output && Object.keys(task.output).length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-2">
              Output
            </h4>
            <div className="p-3 rounded-lg bg-surface-50 dark:bg-surface-900/50 text-sm font-mono overflow-auto max-h-48">
              <pre className="whitespace-pre-wrap">
                {JSON.stringify(task.output, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* Error */}
        {task.error && (
          <div>
            <h4 className="text-xs font-medium text-red-500 uppercase tracking-wider mb-2">
              Error
            </h4>
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-700 dark:text-red-300">{task.error.message}</p>
              {task.error.code && (
                <p className="text-xs text-red-500 mt-1">Code: {task.error.code}</p>
              )}
            </div>
          </div>
        )}

        {/* Status History */}
        <div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center justify-between w-full text-left"
          >
            <h4 className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider">
              Status History ({task.statusHistory?.length || 0})
            </h4>
            {showHistory ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showHistory && task.statusHistory && task.statusHistory.length > 0 && (
            <div className="mt-3 space-y-2">
              {[...task.statusHistory].reverse().map((entry, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-2 rounded-lg bg-surface-50 dark:bg-surface-900/50"
                >
                  <div className="mt-0.5">
                    <TaskStatusBadge status={entry.status} size="sm" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-surface-500 dark:text-surface-400">
                      {formatDateTime(entry.changedAt)}
                    </p>
                    {entry.note && (
                      <p className="text-sm text-surface-600 dark:text-surface-400 mt-0.5">
                        {entry.note}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 p-4 border-t border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900/50">
        {/* Status Note Input */}
        <input
          type="text"
          placeholder="Add a note (optional)..."
          value={statusNote}
          onChange={(e) => setStatusNote(e.target.value)}
          className="w-full px-3 py-2 mb-3 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-sm placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          {getNextActions().map((action) => (
            <button
              key={action.status}
              onClick={() => handleStatusChange(action.status)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${actionColors[action.color]}`}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
