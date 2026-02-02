// Task Action Bar — Context-aware primary action + overflow menu

import { useState, useRef, useEffect } from 'react'
import {
  Play,
  CheckCircle2,
  XCircle,
  RotateCcw,
  ArrowRight,
  MoreHorizontal,
  Edit2,
  Trash2,
  Loader2,
} from 'lucide-react'
import type { Task, TaskStatus } from '@/types/agentpm'
import type { ExecutionPlan } from '@/services/planner/dynamicPlanner'

interface TaskActionBarProps {
  task: Task
  isExecuting?: boolean
  onUpdateStatus?: (taskId: string, status: TaskStatus, note?: string) => void
  onApprovePlan?: (taskId: string, plan: ExecutionPlan) => void
  onEdit?: (taskId: string) => void
  onDelete?: (taskId: string) => void
}

export function TaskActionBar({
  task,
  isExecuting,
  onUpdateStatus,
  onApprovePlan,
  onEdit,
  onDelete,
}: TaskActionBarProps) {
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    if (showMenu) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu])

  const taskInput = task.input as Record<string, unknown> | undefined
  const plan = taskInput?.plan as ExecutionPlan | undefined
  const hasOutput = task.output && Object.keys(task.output).length > 0
  const hasPlan = plan && plan.steps && plan.steps.length > 0
  const isPlanReview = task.status === 'review' && hasPlan && !hasOutput

  // Determine primary action
  const getPrimaryAction = (): {
    label: string
    icon: React.ReactNode
    color: string
    onClick: () => void
  } | null => {
    if (isExecuting) {
      return {
        label: 'Running...',
        icon: <Loader2 size={16} className="animate-spin" />,
        color: 'bg-surface-300 dark:bg-surface-600 text-surface-500 cursor-not-allowed',
        onClick: () => {},
      }
    }

    switch (task.status) {
      case 'draft':
        return {
          label: 'Move to Ready',
          icon: <ArrowRight size={16} />,
          color: 'bg-blue-600 hover:bg-blue-700 text-white',
          onClick: () => onUpdateStatus?.(task.id, 'pending'),
        }
      case 'pending':
        return {
          label: 'Queue Task',
          icon: <Play size={16} />,
          color: 'bg-blue-600 hover:bg-blue-700 text-white',
          onClick: () => onUpdateStatus?.(task.id, 'queued'),
        }
      case 'review':
        if (isPlanReview && onApprovePlan && plan) {
          return {
            label: 'Run All Steps',
            icon: <Play size={16} />,
            color: 'bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white',
            onClick: () => {
              const allAtOncePlan = { ...plan, executionMode: 'plan-then-execute' as const }
              onApprovePlan(task.id, allAtOncePlan)
            },
          }
        }
        if (hasOutput) {
          return {
            label: 'Approve',
            icon: <CheckCircle2 size={16} />,
            color: 'bg-green-600 hover:bg-green-700 text-white',
            onClick: () => onUpdateStatus?.(task.id, 'completed'),
          }
        }
        return null
      case 'completed':
        return {
          label: 'Run Again',
          icon: <RotateCcw size={16} />,
          color: 'bg-surface-200 dark:bg-surface-700 hover:bg-surface-300 dark:hover:bg-surface-600 text-surface-700 dark:text-surface-300',
          onClick: () => onUpdateStatus?.(task.id, 'pending'),
        }
      case 'failed':
        return {
          label: 'Retry',
          icon: <RotateCcw size={16} />,
          color: 'bg-orange-500 hover:bg-orange-600 text-white',
          onClick: () => onUpdateStatus?.(task.id, 'pending'),
        }
      case 'cancelled':
        return {
          label: 'Reopen',
          icon: <RotateCcw size={16} />,
          color: 'bg-surface-200 dark:bg-surface-700 hover:bg-surface-300 dark:hover:bg-surface-600 text-surface-700 dark:text-surface-300',
          onClick: () => onUpdateStatus?.(task.id, 'pending'),
        }
      default:
        return null
    }
  }

  // Secondary actions for overflow menu
  const getSecondaryActions = (): { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }[] => {
    const actions: { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }[] = []

    // Status-specific secondaries
    if (isPlanReview) {
      actions.push({
        label: 'Cancel Plan',
        icon: <XCircle size={14} />,
        onClick: () => onUpdateStatus?.(task.id, 'cancelled', 'Plan cancelled'),
      })
    } else if (task.status === 'review' && hasOutput) {
      actions.push({
        label: 'Request Changes',
        icon: <RotateCcw size={14} />,
        onClick: () => onUpdateStatus?.(task.id, 'in_progress', 'Changes requested'),
      })
    } else if (task.status === 'queued') {
      actions.push({
        label: 'Unqueue',
        icon: <XCircle size={14} />,
        onClick: () => onUpdateStatus?.(task.id, 'pending'),
      })
    }

    // Always available
    if (onEdit) {
      actions.push({
        label: 'Edit Task',
        icon: <Edit2 size={14} />,
        onClick: () => onEdit(task.id),
      })
    }

    if (onDelete) {
      actions.push({
        label: 'Delete',
        icon: <Trash2 size={14} />,
        onClick: () => {
          requestAnimationFrame(() => {
            if (window.confirm(`Delete "${task.title}"? This cannot be undone.`)) {
              onDelete(task.id)
            }
          })
        },
        danger: true,
      })
    }

    return actions
  }

  const primary = getPrimaryAction()
  const secondaries = getSecondaryActions()

  // Don't render if nothing to show
  if (!primary && secondaries.length === 0) return null

  return (
    <div className="flex-shrink-0 flex items-center gap-2 px-4 py-3 border-t border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900/50">
      {/* Primary action */}
      {primary && (
        <button
          onClick={primary.onClick}
          disabled={isExecuting}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm ${primary.color}`}
        >
          {primary.icon}
          {primary.label}
        </button>
      )}

      <div className="flex-1" />

      {/* Overflow menu */}
      {secondaries.length > 0 && (
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-500 transition-colors"
          >
            <MoreHorizontal size={18} />
          </button>

          {showMenu && (
            <div className="absolute right-0 bottom-full mb-1 z-50 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-600 rounded-lg shadow-lg py-1 min-w-[160px]">
              {secondaries.map((action, i) => (
                <button
                  key={i}
                  onClick={() => {
                    action.onClick()
                    setShowMenu(false)
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                    action.danger
                      ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                      : 'text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700'
                  }`}
                >
                  {action.icon}
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
