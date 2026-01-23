// Kanban View - Kanban board for AgentPM tasks
// Supports multi-select: Ctrl/Cmd+click to select multiple, then drag all at once

import { useState, useMemo, useCallback } from 'react'
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
}

const DEFAULT_COLUMNS: Column[] = [
  { id: 'inbox', title: 'Inbox' },
  { id: 'ready', title: 'Ready' },
  { id: 'queued', title: 'Queued' },
  { id: 'in_progress', title: 'In Progress' },
  { id: 'review', title: 'Review' },
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
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const [isDragging, setIsDragging] = useState(false) // Track if actual drag occurred
  const [mouseDownPos, setMouseDownPos] = useState<{ x: number; y: number } | null>(null)

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

  // Track mousedown position to detect clicks vs drags
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setMouseDownPos({ x: e.clientX, y: e.clientY })
  }, [])

  // Handle task click via mouseup - more reliable than onClick with draggable
  const handleTaskMouseUp = useCallback((e: React.MouseEvent, task: Task) => {
    // If a drag occurred, don't process as click
    if (isDragging) {
      return
    }

    // Check if mouse moved significantly (indicating drag intent)
    if (mouseDownPos) {
      const dx = Math.abs(e.clientX - mouseDownPos.x)
      const dy = Math.abs(e.clientY - mouseDownPos.y)
      if (dx > 5 || dy > 5) {
        // Mouse moved - this was a drag, not a click
        setMouseDownPos(null)
        return
      }
    }
    setMouseDownPos(null)

    e.stopPropagation()

    const isMultiSelect = e.ctrlKey || e.metaKey
    const isShiftSelect = e.shiftKey

    if (isMultiSelect) {
      // Toggle selection
      setSelectedTaskIds((prev) => {
        const newSet = new Set(prev)
        if (newSet.has(task.id)) {
          newSet.delete(task.id)
        } else {
          newSet.add(task.id)
        }
        return newSet
      })
    } else if (isShiftSelect && selectedTaskIds.size > 0) {
      // Range select within same column
      const columnId = STATUS_TO_COLUMN[task.status]
      const columnTasks = tasks.filter((t) => STATUS_TO_COLUMN[t.status] === columnId)
      const taskIds = columnTasks.map((t) => t.id)
      const lastSelected = Array.from(selectedTaskIds).pop()
      if (lastSelected) {
        const lastIdx = taskIds.indexOf(lastSelected)
        const currentIdx = taskIds.indexOf(task.id)
        if (lastIdx !== -1 && currentIdx !== -1) {
          const start = Math.min(lastIdx, currentIdx)
          const end = Math.max(lastIdx, currentIdx)
          const rangeIds = taskIds.slice(start, end + 1)
          setSelectedTaskIds((prev) => {
            const newSet = new Set(prev)
            rangeIds.forEach((id) => newSet.add(id))
            return newSet
          })
        }
      }
    } else {
      // Regular click - clear selection and open task detail
      setSelectedTaskIds(new Set())
      onTaskClick(task.id)
    }
  }, [isDragging, mouseDownPos, selectedTaskIds, tasks, onTaskClick])

  // Legacy click handler kept as fallback (some browsers might not fire mouseup properly)
  const handleTaskSelect = useCallback((e: React.MouseEvent, task: Task) => {
    // If a drag just ended, don't process the click
    if (isDragging) {
      return
    }
    // If mouseup already handled this, skip
    if (!mouseDownPos) {
      return
    }

    const isMultiSelect = e.ctrlKey || e.metaKey
    const isShiftSelect = e.shiftKey

    if (isMultiSelect) {
      // Toggle selection
      setSelectedTaskIds((prev) => {
        const newSet = new Set(prev)
        if (newSet.has(task.id)) {
          newSet.delete(task.id)
        } else {
          newSet.add(task.id)
        }
        return newSet
      })
      e.stopPropagation()
    } else if (isShiftSelect && selectedTaskIds.size > 0) {
      // Range select within same column
      const columnId = STATUS_TO_COLUMN[task.status]
      const columnTasks = tasks.filter((t) => STATUS_TO_COLUMN[t.status] === columnId)
      const taskIds = columnTasks.map((t) => t.id)
      const lastSelected = Array.from(selectedTaskIds).pop()
      if (lastSelected) {
        const lastIdx = taskIds.indexOf(lastSelected)
        const currentIdx = taskIds.indexOf(task.id)
        if (lastIdx !== -1 && currentIdx !== -1) {
          const start = Math.min(lastIdx, currentIdx)
          const end = Math.max(lastIdx, currentIdx)
          const rangeIds = taskIds.slice(start, end + 1)
          setSelectedTaskIds((prev) => {
            const newSet = new Set(prev)
            rangeIds.forEach((id) => newSet.add(id))
            return newSet
          })
        }
      }
      e.stopPropagation()
    } else {
      // Regular click - clear selection and open task detail
      setSelectedTaskIds(new Set())
      onTaskClick(task.id)
    }
    setMouseDownPos(null)
  }, [isDragging, mouseDownPos, selectedTaskIds, tasks, onTaskClick])

  // Clear selection when clicking outside
  const handleBackgroundClick = useCallback(() => {
    if (selectedTaskIds.size > 0) {
      setSelectedTaskIds(new Set())
    }
  }, [selectedTaskIds])

  const handleDragStart = useCallback((e: React.DragEvent, task: Task) => {
    console.log('[Kanban] Drag started:', task.title)
    setIsDragging(true) // Mark that a drag started
    // If dragging a selected task, drag all selected
    // If dragging an unselected task, just drag that one
    if (selectedTaskIds.has(task.id) && selectedTaskIds.size > 1) {
      // Multi-drag
      const selectedTasks = tasks.filter((t) => selectedTaskIds.has(t.id))
      e.dataTransfer.setData('text/plain', JSON.stringify(selectedTasks.map((t) => t.id)))
      e.dataTransfer.effectAllowed = 'move'
      setDraggedTask(task) // Use first task as visual reference
      console.log('[Kanban] Multi-drag:', selectedTasks.length, 'tasks')
    } else {
      // Single drag
      setDraggedTask(task)
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', task.id)
      console.log('[Kanban] Single drag:', task.id)
    }
  }, [selectedTaskIds, tasks])

  const handleDragEnd = useCallback(() => {
    setDraggedTask(null)
    setDragOverColumn(null)
    // Reset isDragging after a short delay to allow click to check it
    setTimeout(() => setIsDragging(false), 50)
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
      console.log('[Kanban] Drop on column:', columnId, 'draggedTask:', draggedTask?.title)
      e.preventDefault()
      setDragOverColumn(null)

      if (!draggedTask) {
        console.log('[Kanban] Drop cancelled - no draggedTask')
        return
      }

      const newStatus = COLUMN_TO_STATUS[columnId]
      if (!newStatus) {
        console.log('[Kanban] Drop cancelled - invalid column:', columnId)
        return
      }

      // Check if this is a multi-drag
      const dataStr = e.dataTransfer.getData('text/plain')
      let taskIdsToMove: string[] = []

      try {
        // Try to parse as JSON array (multi-select)
        const parsed = JSON.parse(dataStr)
        if (Array.isArray(parsed)) {
          taskIdsToMove = parsed
        } else {
          taskIdsToMove = [draggedTask.id]
        }
      } catch {
        // Single task drag
        taskIdsToMove = [draggedTask.id]
      }

      // Move all tasks to the new column
      const tasksToMove = tasks.filter((t) => taskIdsToMove.includes(t.id))
      console.log(`[Kanban] Moving ${tasksToMove.length} tasks to ${columnId}, newStatus: ${newStatus}`)

      // Fire all status changes in parallel for SIZZLE
      tasksToMove.forEach((task) => {
        const currentColumn = STATUS_TO_COLUMN[task.status]
        console.log(`[Kanban] Task "${task.title}" current column: ${currentColumn}, target: ${columnId}`)
        if (currentColumn !== columnId) {
          console.log(`[Kanban] Calling onStatusChange for task ${task.id} to ${newStatus}`)
          onStatusChange(task.id, newStatus)
        } else {
          console.log(`[Kanban] Task already in target column, skipping`)
        }
      })

      // Clear selection after drop
      setSelectedTaskIds(new Set())
    },
    [draggedTask, onStatusChange, tasks]
  )

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="h-full w-full overflow-x-auto relative" style={{ background: '#0a0a0f' }} onClick={handleBackgroundClick}>
      {/* Multi-select indicator */}
      {selectedTaskIds.size > 0 && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-full shadow-lg flex items-center gap-2">
          <span>{selectedTaskIds.size} tasks selected</span>
          <span className="text-primary-200">• Drag to move all</span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setSelectedTaskIds(new Set())
            }}
            className="ml-2 hover:bg-primary-500 rounded px-2"
          >
            ✕
          </button>
        </div>
      )}
      <div className="flex gap-3 p-4 h-full min-w-fit">
        {DEFAULT_COLUMNS.map((column) => {
          const columnTasks = tasksByColumn[column.id] || []
          const isDropTarget = dragOverColumn === column.id

          return (
            <div
              key={column.id}
              className={`flex flex-col flex-1 min-w-[200px] max-w-[320px] rounded-lg border transition-all ${
                isDropTarget
                  ? 'border-primary-500 shadow-[0_0_0_2px_rgba(14,165,233,0.2)]'
                  : 'border-surface-700'
              }`}
              style={{ background: '#111118' }}
              onDragOver={(e) => handleDragOver(e, column.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, column.id)}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Column Header */}
              <div className="p-3 border-b border-surface-700">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">{column.title}</h3>
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-surface-700 text-surface-400">
                    {columnTasks.length}
                  </span>
                </div>
              </div>

              {/* Card List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[100px]">
                {columnTasks.map((task) => {
                  const priority = PRIORITY_CONFIG[task.priority]
                  const isAgent = task.assignedToType === 'agent'
                  const assigneeName = task.assignedTo ? agents.get(task.assignedTo) : null
                  const isOverdue = task.dueAt && new Date(task.dueAt) < new Date() && task.status !== 'completed'
                  const isBeingDragged = draggedTask?.id === task.id
                  const isSelected = selectedTaskIds.has(task.id)

                  return (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task)}
                      onDragEnd={handleDragEnd}
                      onMouseDown={handleMouseDown}
                      onMouseUp={(e) => handleTaskMouseUp(e, task)}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleTaskSelect(e, task)
                      }}
                      className={`p-3 rounded-md cursor-grab active:cursor-grabbing transition-all border relative ${
                        isSelected
                          ? 'border-primary-500 ring-2 ring-primary-500/30 bg-primary-500/10'
                          : 'hover:border-primary-500 hover:shadow-[0_0_0_1px_rgba(14,165,233,0.3)]'
                      } ${isBeingDragged ? 'opacity-50' : ''}`}
                      style={{
                        background: isSelected ? '#1a2a3a' : '#1a1a24',
                        borderColor: isSelected ? '#0ea5e9' : '#2a2a3a',
                      }}
                    >
                      {/* Selection indicator */}
                      {isSelected && (
                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                          ✓
                        </div>
                      )}

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
                    </div>
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
