// Kanban View - Kanban board for AgentPM tasks

import { useState, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import type { Task, TaskStatus } from '@/types/agentpm'

// Status to column mapping
const STATUS_TO_COLUMN: Record<TaskStatus, string> = {
  draft: 'inbox',
  pending: 'ready',
  queued: 'queued',
  in_progress: 'in_progress',
  review: 'review',
  completed: 'done',
  failed: 'inbox',
  cancelled: 'inbox',
}

const COLUMN_TO_STATUS: Record<string, TaskStatus> = {
  inbox: 'draft',
  ready: 'pending',
  queued: 'queued',
  in_progress: 'in_progress',
  review: 'review',
  done: 'completed',
}

interface Column {
  id: string
  title: string
  wipLimit?: number
}

const DEFAULT_COLUMNS: Column[] = [
  { id: 'inbox', title: 'Inbox' },
  { id: 'ready', title: 'Ready' },
  { id: 'queued', title: 'Queued', wipLimit: 10 },
  { id: 'in_progress', title: 'In Progress', wipLimit: 5 },
  { id: 'review', title: 'Review', wipLimit: 3 },
  { id: 'done', title: 'Done' },
]

// Priority config for badges
const PRIORITY_CONFIG = {
  critical: { emoji: '🔴', color: 'bg-red-500/20 text-red-400', label: 'Critical' },
  high: { emoji: '🔴', color: 'bg-red-500/20 text-red-400', label: 'High' },
  medium: { emoji: '🟡', color: 'bg-yellow-500/20 text-yellow-400', label: 'Medium' },
  low: { emoji: '🟢', color: 'bg-green-500/20 text-green-400', label: 'Low' },
}

interface KanbanViewProps {
  tasks: Task[]
  agents: Map<string, string>
  onTaskClick: (taskId: string) => void
  onAddTask: (columnId: string) => void
  onStatusChange: (taskId: string, status: TaskStatus) => void
}

export function KanbanView({
  tasks,
  agents,
  onTaskClick,
  onAddTask,
  onStatusChange,
}: KanbanViewProps) {
  const [draggedTask, setDraggedTask] = useState<Task | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null)

  // Group tasks by column
  const tasksByColumn = useMemo(() => {
    const grouped: Record<string, Task[]> = {
      inbox: [],
      ready: [],
      queued: [],
      in_progress: [],
      review: [],
      done: [],
    }

    tasks.forEach((task) => {
      const columnId = STATUS_TO_COLUMN[task.status] || 'inbox'
      if (grouped[columnId]) {
        grouped[columnId].push(task)
      }
    })

    // Sort each column by priority and then by updated date
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
    Object.keys(grouped).forEach((columnId) => {
      grouped[columnId].sort((a, b) => {
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
        if (priorityDiff !== 0) return priorityDiff
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      })
    })

    return grouped
  }, [tasks])

  const handleDragStart = useCallback((e: React.DragEvent, task: Task) => {
    setDraggedTask(task)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', task.id)
  }, [])

  const handleDragEnd = useCallback(() => {
    setDraggedTask(null)
    setDragOverColumn(null)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, columnId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverColumn(columnId)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOverColumn(null)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent, columnId: string) => {
      e.preventDefault()
      setDragOverColumn(null)

      if (!draggedTask) return

      const currentColumnId = STATUS_TO_COLUMN[draggedTask.status]
      if (currentColumnId === columnId) return

      const newStatus = COLUMN_TO_STATUS[columnId]
      if (newStatus) {
        onStatusChange(draggedTask.id, newStatus)
      }
    },
    [draggedTask, onStatusChange]
  )

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="flex h-full overflow-x-auto" style={{ background: '#0a0a0f' }}>
      <div className="flex gap-4 p-4 min-w-max">
        {DEFAULT_COLUMNS.map((column) => {
          const columnTasks = tasksByColumn[column.id] || []
          const isOverLimit = column.wipLimit !== undefined && columnTasks.length > column.wipLimit
          const isAtLimit = column.wipLimit !== undefined && columnTasks.length === column.wipLimit
          const isDropTarget = dragOverColumn === column.id

          return (
            <div
              key={column.id}
              className={`flex flex-col w-80 rounded-lg border transition-all ${
                isDropTarget
                  ? 'border-primary-500 shadow-[0_0_0_2px_rgba(14,165,233,0.2)]'
                  : 'border-surface-700'
              }`}
              style={{ background: '#111118' }}
              onDragOver={(e) => handleDragOver(e, column.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, column.id)}
            >
              {/* Column Header */}
              <div className="p-3 border-b border-surface-700">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">{column.title}</h3>
                  <span
                    className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                      isOverLimit
                        ? 'bg-red-500/20 text-red-400'
                        : isAtLimit
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-surface-700 text-surface-400'
                    }`}
                  >
                    {columnTasks.length}
                    {column.wipLimit !== undefined && `/${column.wipLimit}`}
                  </span>
                </div>
                {isOverLimit && (
                  <span className="text-xs text-red-400 mt-1 block">Over WIP limit!</span>
                )}
              </div>

              {/* Card List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[100px]">
                {columnTasks.map((task) => {
                  const priority = PRIORITY_CONFIG[task.priority]
                  const isAgent = task.assignedToType === 'agent'
                  const assigneeName = task.assignedTo ? agents.get(task.assignedTo) : null
                  const isOverdue = task.dueAt && new Date(task.dueAt) < new Date() && task.status !== 'completed'
                  const isDragging = draggedTask?.id === task.id

                  return (
                    <motion.div
                      key={task.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: isDragging ? 0.5 : 1, y: 0 }}
                      draggable
                      onDragStart={(e) => handleDragStart(e as unknown as React.DragEvent, task)}
                      onDragEnd={handleDragEnd}
                      onClick={() => onTaskClick(task.id)}
                      className="p-3 rounded-md cursor-pointer transition-all border hover:border-primary-500 hover:shadow-[0_0_0_1px_rgba(14,165,233,0.3)]"
                      style={{
                        background: '#1a1a24',
                        borderColor: '#2a2a3a',
                      }}
                    >
                      {/* Title */}
                      <h4 className="text-sm font-medium text-white line-clamp-2 mb-2">
                        {task.title}
                      </h4>

                      {/* Meta Row */}
                      <div className="flex items-center flex-wrap gap-2 mb-2">
                        <span className={`px-2 py-0.5 text-xs rounded-full ${priority.color}`}>
                          {priority.emoji} {priority.label}
                        </span>

                        {assigneeName && (
                          <div className="flex items-center gap-1 text-xs text-surface-400">
                            <span>{isAgent ? '🤖' : '👤'}</span>
                            <span className="max-w-[80px] truncate">{assigneeName}</span>
                          </div>
                        )}
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-between text-xs text-surface-500">
                        {task.dueAt && (
                          <span className={isOverdue ? 'text-red-400' : ''}>
                            📅 {formatDate(task.dueAt)}
                          </span>
                        )}
                        {!task.dueAt && <span />}
                      </div>
                    </motion.div>
                  )
                })}

                {columnTasks.length === 0 && (
                  <div className="flex items-center justify-center py-8 text-surface-500 text-sm">
                    No tasks
                  </div>
                )}
              </div>

              {/* Add Task Button */}
              <button
                onClick={() => onAddTask(column.id)}
                className="flex items-center justify-center gap-1 w-full p-2 border-t border-surface-700 text-surface-400 text-sm font-medium hover:bg-surface-800 hover:text-primary-400 transition-colors"
              >
                <span className="text-lg leading-none">+</span>
                <span>Add Task</span>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default KanbanView
