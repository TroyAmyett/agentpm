// Task Detail - Full task view with status history and actions

import { useState, useEffect } from 'react'
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
  Copy,
  Check,
  ExternalLink,
  Sparkles,
  FileOutput,
  FileText,
  History,
} from 'lucide-react'
import type { Task, TaskStatus, AgentPersona, Skill } from '@/types/agentpm'
import { TaskStatusBadge } from './TaskStatusBadge'
import { TaskPriorityBadge } from './TaskPriorityBadge'
import { TaskDependencies } from './TaskDependencies'
import { ExecutionPanel } from './ExecutionPanel'
import { useTimezoneFunctions } from '@/lib/timezone'

interface TaskDetailProps {
  task: Task
  agent?: AgentPersona
  skill?: Skill
  allTasks?: Task[]
  accountId?: string
  userId?: string
  onClose?: () => void
  onUpdateStatus?: (taskId: string, status: TaskStatus, note?: string) => void
  onDelete?: (taskId: string) => void
  onEdit?: (taskId: string) => void
  onDependencyChange?: () => void
}

type TabType = 'output' | 'details' | 'history'

export function TaskDetail({
  task,
  agent,
  skill,
  allTasks = [],
  accountId,
  userId,
  onClose,
  onUpdateStatus,
  onDelete,
  onEdit,
  onDependencyChange,
}: TaskDetailProps) {
  // Default to output tab if task is in review, otherwise details
  const defaultTab: TabType = task.status === 'review' || task.output ? 'output' : 'details'
  const [activeTab, setActiveTab] = useState<TabType>(defaultTab)
  const [statusNote, setStatusNote] = useState('')
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [showRawOutput, setShowRawOutput] = useState(false)

  // Update default tab when task changes
  useEffect(() => {
    const newDefault: TabType = task.status === 'review' || task.output ? 'output' : 'details'
    setActiveTab(newDefault)
  }, [task.id, task.status, task.output])

  const { formatDateTime, formatDate } = useTimezoneFunctions()

  const formatDateDisplay = (dateStr?: string) => {
    if (!dateStr) return '-'
    return formatDate(dateStr, 'medium')
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

  const handleDelete = () => {
    // Defer confirm to next frame to avoid blocking INP
    requestAnimationFrame(() => {
      if (window.confirm(`Are you sure you want to delete "${task.title}"? This action cannot be undone.`)) {
        onDelete?.(task.id)
      }
    })
  }

  const copyToClipboard = async (text: string, fieldName: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedField(fieldName)
    setTimeout(() => setCopiedField(null), 2000)
  }

  // Render agent output in a human-friendly format
  const renderAgentOutput = () => {
    if (!task.output) return null

    const output = task.output as Record<string, unknown>

    // Extract values upfront with type safety
    const title = output.title ? String(output.title) : null
    const excerpt = output.excerpt ? String(output.excerpt) : null
    const imageUrl = output.imageUrl ? String(output.imageUrl) : null
    const content = output.content ? String(output.content) : null
    const result = output.result ? String(output.result) : null
    const category = output.category ? String(output.category) : null
    const seoTitle = output.seoTitle ? String(output.seoTitle) : null
    const seoDescription = output.seoDescription ? String(output.seoDescription) : null
    const imagePrompt = output.imagePrompt ? String(output.imagePrompt) : null
    const tags = Array.isArray(output.tags) ? output.tags.map(t => String(t)) : []

    // Check if this is blog content (has title, content, etc.)
    if (title || content || result) {
      return (
        <div className="space-y-4">
          {/* Title */}
          {title && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-surface-500 dark:text-surface-400">Title</span>
                <button
                  onClick={() => copyToClipboard(title, 'title')}
                  className="p-1 hover:bg-surface-200 dark:hover:bg-surface-700 rounded"
                  title="Copy"
                >
                  {copiedField === 'title' ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                </button>
              </div>
              <p className="text-lg font-semibold text-surface-900 dark:text-surface-100">
                {title}
              </p>
            </div>
          )}

          {/* Excerpt */}
          {excerpt && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-surface-500 dark:text-surface-400">Excerpt</span>
                <button
                  onClick={() => copyToClipboard(excerpt, 'excerpt')}
                  className="p-1 hover:bg-surface-200 dark:hover:bg-surface-700 rounded"
                  title="Copy"
                >
                  {copiedField === 'excerpt' ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                </button>
              </div>
              <p className="text-surface-600 dark:text-surface-400 italic">
                {excerpt}
              </p>
            </div>
          )}

          {/* Image URL */}
          {imageUrl && (
            <div>
              <span className="text-xs font-medium text-surface-500 dark:text-surface-400 block mb-2">
                Generated Image
              </span>
              <div className="rounded-lg overflow-hidden border border-surface-200 dark:border-surface-700">
                <img
                  src={imageUrl}
                  alt="Generated"
                  className="w-full h-48 object-cover"
                />
              </div>
              <a
                href={imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 mt-2"
              >
                <ExternalLink size={12} />
                Open full size
              </a>
            </div>
          )}

          {/* Content/Result */}
          {(content || result) && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-surface-500 dark:text-surface-400">
                  {content ? 'Content' : 'Result'}
                </span>
                <button
                  onClick={() => copyToClipboard(content || result || '', 'content')}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-surface-200 dark:bg-surface-700 hover:bg-surface-300 dark:hover:bg-surface-600 rounded"
                >
                  {copiedField === 'content' ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                  Copy
                </button>
              </div>
              <div className="p-4 rounded-lg bg-surface-50 dark:bg-surface-900/50 border border-surface-200 dark:border-surface-700 max-h-96 overflow-auto">
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  {/* Render as formatted text with line breaks */}
                  {(content || result || '')
                    .split(/\\n|[\n]/)
                    .map((line, i) => {
                      const trimmedLine = line.trim()
                      if (!trimmedLine) return <br key={i} />
                      if (trimmedLine.startsWith('## ')) {
                        return <h2 key={i} className="text-lg font-semibold mt-4 mb-2">{trimmedLine.replace('## ', '')}</h2>
                      }
                      if (trimmedLine.startsWith('### ')) {
                        return <h3 key={i} className="text-base font-semibold mt-3 mb-1">{trimmedLine.replace('### ', '')}</h3>
                      }
                      if (trimmedLine.startsWith('- ')) {
                        return <li key={i} className="ml-4">{trimmedLine.replace('- ', '')}</li>
                      }
                      if (trimmedLine.startsWith('**') && trimmedLine.endsWith('**')) {
                        return <p key={i} className="font-semibold">{trimmedLine.replace(/\*\*/g, '')}</p>
                      }
                      return <p key={i} className="mb-2">{trimmedLine}</p>
                    })}
                </div>
              </div>
            </div>
          )}

          {/* Metadata (tags, category, etc.) */}
          <div className="flex flex-wrap gap-2">
            {category && (
              <span className="px-2 py-1 text-xs bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded">
                {category}
              </span>
            )}
            {tags.map((tag, i) => (
              <span key={i} className="px-2 py-1 text-xs bg-surface-200 dark:bg-surface-700 rounded">
                {tag}
              </span>
            ))}
          </div>

          {/* SEO Fields */}
          {(seoTitle || seoDescription) && (
            <details className="group">
              <summary className="text-xs font-medium text-surface-500 dark:text-surface-400 cursor-pointer hover:text-surface-700 dark:hover:text-surface-300">
                SEO Fields
              </summary>
              <div className="mt-2 p-3 rounded-lg bg-surface-100 dark:bg-surface-900 text-sm space-y-2">
                {seoTitle && (
                  <div>
                    <span className="text-xs text-surface-500">Title:</span>
                    <p>{seoTitle}</p>
                  </div>
                )}
                {seoDescription && (
                  <div>
                    <span className="text-xs text-surface-500">Description:</span>
                    <p>{seoDescription}</p>
                  </div>
                )}
              </div>
            </details>
          )}

          {/* Image Prompt */}
          {imagePrompt && (
            <details className="group">
              <summary className="text-xs font-medium text-surface-500 dark:text-surface-400 cursor-pointer hover:text-surface-700 dark:hover:text-surface-300">
                Image Prompt
              </summary>
              <div className="mt-2 p-3 rounded-lg bg-surface-100 dark:bg-surface-900 text-sm">
                <p className="text-surface-600 dark:text-surface-400">{imagePrompt}</p>
              </div>
            </details>
          )}

          {/* Toggle raw output */}
          <button
            onClick={() => setShowRawOutput(!showRawOutput)}
            className="text-xs text-surface-500 hover:text-surface-700 dark:hover:text-surface-300"
          >
            {showRawOutput ? 'Hide' : 'Show'} raw output
          </button>
          {showRawOutput && (
            <pre className="p-3 rounded-lg bg-surface-100 dark:bg-surface-900 text-xs overflow-auto max-h-48">
              {JSON.stringify(task.output, null, 2)}
            </pre>
          )}
        </div>
      )
    }

    // Fallback to JSON for non-standard output
    return (
      <div className="p-3 rounded-lg bg-surface-50 dark:bg-surface-900/50 text-sm font-mono overflow-auto max-h-48">
        <pre className="whitespace-pre-wrap">
          {JSON.stringify(task.output, null, 2)}
        </pre>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="flex flex-col h-full bg-white dark:bg-surface-800 border-l border-surface-200 dark:border-surface-700"
    >
      {/* Header Actions */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-surface-50 dark:bg-surface-900/50">
        <span className="text-xs font-medium text-surface-500 uppercase tracking-wider">Task Details</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit?.(task.id)}
            className="p-1.5 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-500 transition-colors"
            title="Edit"
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={handleDelete}
            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-surface-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            title="Delete"
          >
            <Trash2 size={16} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-500 transition-colors"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Title Bar */}
      <div className="flex-shrink-0 px-4 pt-3 pb-2 border-b border-surface-200 dark:border-surface-700">
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="text-base font-semibold text-surface-900 dark:text-surface-100 leading-tight line-clamp-2">
            {task.title}
          </h3>
          <div className="flex items-center gap-1">
            <TaskStatusBadge status={task.status} size="sm" />
            <TaskPriorityBadge priority={task.priority} size="sm" />
          </div>
        </div>
        {task.assignedTo && agent && (
          <div className="flex items-center gap-2 text-xs text-surface-500 dark:text-surface-400">
            {task.assignedToType === 'agent' ? (
              <Bot size={14} className="text-primary-500" />
            ) : (
              <User size={14} />
            )}
            <span>{agent.alias}</span>
            <span className="text-surface-400">•</span>
            <span>{agent.agentType}</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 flex border-b border-surface-200 dark:border-surface-700">
        <button
          onClick={() => setActiveTab('output')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors relative
            ${activeTab === 'output'
              ? 'text-primary-600 dark:text-primary-400'
              : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
            }`}
        >
          <FileOutput size={16} />
          Output
          {(task.output || task.error) && (
            <span className="w-2 h-2 rounded-full bg-primary-500" />
          )}
          {activeTab === 'output' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600 dark:bg-primary-400" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('details')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors relative
            ${activeTab === 'details'
              ? 'text-primary-600 dark:text-primary-400'
              : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
            }`}
        >
          <FileText size={16} />
          Details
          {activeTab === 'details' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600 dark:bg-primary-400" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors relative
            ${activeTab === 'history'
              ? 'text-primary-600 dark:text-primary-400'
              : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
            }`}
        >
          <History size={16} />
          History
          {task.statusHistory && task.statusHistory.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-surface-200 dark:bg-surface-700">
              {task.statusHistory.length}
            </span>
          )}
          {activeTab === 'history' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600 dark:bg-primary-400" />
          )}
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto p-4">
        {/* Output Tab */}
        {activeTab === 'output' && (
          <div className="space-y-4">
            {/* Agent Execution */}
            {accountId && userId && task.assignedToType === 'agent' && (
              <div className="p-4 rounded-lg bg-gradient-to-r from-primary-50 to-purple-50 dark:from-primary-900/20 dark:to-purple-900/20 border border-primary-200 dark:border-primary-800">
                <h4 className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-3">
                  Agent Execution
                </h4>
                <ExecutionPanel
                  task={task}
                  agent={agent}
                  skill={skill}
                  accountId={accountId}
                  userId={userId}
                />
              </div>
            )}

            {/* Error */}
            {task.error && (
              <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <h4 className="text-xs font-medium text-red-500 uppercase tracking-wider mb-2">
                  Error
                </h4>
                <p className="text-sm text-red-700 dark:text-red-300">{task.error.message}</p>
                {task.error.code && (
                  <p className="text-xs text-red-500 mt-1">Code: {task.error.code}</p>
                )}
              </div>
            )}

            {/* Output */}
            {task.output && Object.keys(task.output).length > 0 ? (
              <div>
                <h4 className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-3">
                  Task Output
                </h4>
                {renderAgentOutput()}
              </div>
            ) : !task.error && (
              <div className="text-center py-8 text-surface-500 dark:text-surface-400">
                <FileOutput size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">No output yet</p>
                <p className="text-xs mt-1">Output will appear here after the task runs</p>
              </div>
            )}
          </div>
        )}

        {/* Details Tab */}
        {activeTab === 'details' && (
          <div className="space-y-5">
            {/* Description */}
            {task.description && (
              <div>
                <h4 className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-2">
                  Description
                </h4>
                <p className="text-surface-700 dark:text-surface-300">{task.description}</p>
              </div>
            )}

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

            {/* Skill */}
            {skill && (
              <div>
                <h4 className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-2">
                  Skill
                </h4>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-surface-900 dark:text-surface-100">
                      {skill.name}
                    </p>
                    <p className="text-xs text-surface-500 dark:text-surface-400 truncate">
                      {skill.description || skill.category}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-1">
                  Due Date
                </h4>
                <div className="flex items-center gap-2 text-surface-900 dark:text-surface-100">
                  <Calendar size={16} className="text-surface-400" />
                  {formatDateDisplay(task.dueAt)}
                </div>
              </div>
              <div>
                <h4 className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-1">
                  Created
                </h4>
                <div className="flex items-center gap-2 text-surface-900 dark:text-surface-100">
                  <Clock size={16} className="text-surface-400" />
                  {formatDateDisplay(task.createdAt)}
                </div>
              </div>
            </div>

            {/* Dependencies */}
            {accountId && userId && allTasks.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-3">
                  Dependencies
                </h4>
                <TaskDependencies
                  task={task}
                  allTasks={allTasks}
                  accountId={accountId}
                  userId={userId}
                  onDependencyChange={onDependencyChange}
                />
              </div>
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="space-y-2">
            {task.statusHistory && task.statusHistory.length > 0 ? (
              [...task.statusHistory].reverse().map((entry, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-3 rounded-lg bg-surface-50 dark:bg-surface-900/50"
                >
                  <div className="mt-0.5">
                    <TaskStatusBadge status={entry.status} size="sm" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-surface-500 dark:text-surface-400">
                      {formatDateTime(entry.changedAt)}
                    </p>
                    {entry.note && (
                      <p className="text-sm text-surface-700 dark:text-surface-300 mt-1">
                        {entry.note}
                      </p>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-surface-500 dark:text-surface-400">
                <History size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">No history yet</p>
              </div>
            )}
          </div>
        )}
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
