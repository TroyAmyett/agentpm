// Review Panel - Panel for reviewing agent work output

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  X,
  Bot,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Clock,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react'
import type { Review, Task, AgentPersona, ReviewStatus } from '@/types/agentpm'

interface ReviewPanelProps {
  review: Review
  task: Task
  agent?: AgentPersona
  onClose?: () => void
  onSubmitReview: (
    reviewId: string,
    status: ReviewStatus,
    feedback?: string,
    requestedChanges?: string[]
  ) => Promise<void>
}

export function ReviewPanel({
  review,
  task,
  agent,
  onClose,
  onSubmitReview,
}: ReviewPanelProps) {
  const [feedback, setFeedback] = useState('')
  const [requestedChanges, setRequestedChanges] = useState<string[]>([])
  const [newChange, setNewChange] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const handleAddChange = () => {
    if (newChange.trim()) {
      setRequestedChanges([...requestedChanges, newChange.trim()])
      setNewChange('')
    }
  }

  const handleRemoveChange = (index: number) => {
    setRequestedChanges(requestedChanges.filter((_, i) => i !== index))
  }

  const handleSubmit = async (status: ReviewStatus) => {
    setIsSubmitting(true)
    try {
      await onSubmitReview(
        review.id,
        status,
        feedback || undefined,
        status === 'changes_requested' ? requestedChanges : undefined
      )
    } finally {
      setIsSubmitting(false)
    }
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
        <div>
          <h2 className="font-semibold text-surface-900 dark:text-surface-100">Review Output</h2>
          <p className="text-xs text-surface-500 dark:text-surface-400 flex items-center gap-1 mt-0.5">
            <Clock size={12} />
            Submitted {formatDateTime(review.createdAt)}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-500 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Agent Info */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-50 dark:bg-surface-900/50">
          <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
            {agent?.avatar ? (
              <img
                src={agent.avatar}
                alt={agent.alias}
                className="w-full h-full rounded-lg object-cover"
              />
            ) : (
              <Bot className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            )}
          </div>
          <div>
            <p className="font-medium text-surface-900 dark:text-surface-100">
              {agent?.alias || 'Unknown Agent'}
            </p>
            <p className="text-xs text-surface-500 dark:text-surface-400">
              {agent?.agentType || 'Agent'}
            </p>
          </div>
        </div>

        {/* Task */}
        <div>
          <h3 className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-2">
            Task
          </h3>
          <h4 className="font-medium text-surface-900 dark:text-surface-100">{task.title}</h4>
          {task.description && (
            <p className="text-sm text-surface-600 dark:text-surface-400 mt-1">
              {task.description}
            </p>
          )}
        </div>

        {/* Output */}
        <div>
          <h3 className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-2">
            Agent Output
          </h3>
          <div className="p-4 rounded-lg bg-surface-50 dark:bg-surface-900/50 border border-surface-200 dark:border-surface-700">
            {task.output ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                {typeof task.output === 'string' ? (
                  <p>{task.output}</p>
                ) : task.output.content ? (
                  <div className="whitespace-pre-wrap">{String(task.output.content)}</div>
                ) : (
                  <pre className="text-xs overflow-auto">
                    {JSON.stringify(task.output, null, 2)}
                  </pre>
                )}
              </div>
            ) : (
              <p className="text-surface-500 dark:text-surface-400 italic">No output available</p>
            )}
          </div>
        </div>

        {/* Quick Rating */}
        <div>
          <h3 className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-2">
            Quick Rating
          </h3>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors">
              <ThumbsUp size={16} />
              Good
            </button>
            <button className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-600 transition-colors">
              <ThumbsDown size={16} />
              Needs Work
            </button>
          </div>
        </div>

        {/* Feedback */}
        <div>
          <h3 className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-2">
            Feedback (Optional)
          </h3>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Add feedback for the agent..."
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
          />
        </div>

        {/* Requested Changes */}
        <div>
          <h3 className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-2">
            Requested Changes
          </h3>

          {/* Existing Changes */}
          {requestedChanges.length > 0 && (
            <ul className="space-y-2 mb-3">
              {requestedChanges.map((change, index) => (
                <li
                  key={index}
                  className="flex items-start gap-2 p-2 rounded-lg bg-surface-50 dark:bg-surface-900/50"
                >
                  <span className="flex-1 text-sm text-surface-700 dark:text-surface-300">
                    {change}
                  </span>
                  <button
                    onClick={() => handleRemoveChange(index)}
                    className="p-1 rounded hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-400"
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Add New Change */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newChange}
              onChange={(e) => setNewChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddChange()}
              placeholder="Add a change request..."
              className="flex-1 px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-sm placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <button
              onClick={handleAddChange}
              disabled={!newChange.trim()}
              className="px-3 py-2 rounded-lg bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-400 text-sm hover:bg-surface-200 dark:hover:bg-surface-600 disabled:opacity-50 transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 p-4 border-t border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900/50">
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleSubmit('approved')}
            disabled={isSubmitting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition-colors disabled:opacity-50"
          >
            <CheckCircle2 size={18} />
            Approve
          </button>

          {requestedChanges.length > 0 ? (
            <button
              onClick={() => handleSubmit('changes_requested')}
              disabled={isSubmitting}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-yellow-500 hover:bg-yellow-600 text-white font-medium transition-colors disabled:opacity-50"
            >
              <RotateCcw size={18} />
              Request Changes
            </button>
          ) : (
            <button
              onClick={() => handleSubmit('rejected')}
              disabled={isSubmitting}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-surface-200 dark:bg-surface-700 hover:bg-surface-300 dark:hover:bg-surface-600 text-surface-700 dark:text-surface-300 font-medium transition-colors disabled:opacity-50"
            >
              <XCircle size={18} />
              Reject
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}
