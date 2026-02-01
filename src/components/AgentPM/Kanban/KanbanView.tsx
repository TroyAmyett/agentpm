// Kanban View - Enhanced Kanban board for AgentPM tasks
// Supports: multi-select drag, swimlanes, WIP limits

import { useState, useMemo, useCallback } from 'react'
import { Link2, AlertTriangle, Bot, User, ChevronDown, Layers, ArrowUpDown } from 'lucide-react'
import type { Task, TaskStatus, TaskPriority } from '@/types/agentpm'
import { useTimezoneFunctions } from '@/lib/timezone'

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
  { id: 'queued', title: 'Queued' },
  { id: 'in_progress', title: 'In Progress' },
  { id: 'review', title: 'Review' },
  { id: 'done', title: 'Done' },
]

// Priority config for badges
const PRIORITY_CONFIG = {
  critical: { emoji: '🔴', color: 'bg-red-500/20 text-red-400', label: 'Critical', order: 0 },
  high: { emoji: '🟠', color: 'bg-orange-500/20 text-orange-400', label: 'High', order: 1 },
  medium: { emoji: '🟡', color: 'bg-yellow-500/20 text-yellow-400', label: 'Medium', order: 2 },
  low: { emoji: '🟢', color: 'bg-green-500/20 text-green-400', label: 'Low', order: 3 },
}

type SwimlaneMode = 'none' | 'agent' | 'priority' | 'milestone'

interface KanbanViewProps {
  tasks: Task[]
  agents: Map<string, string>
  onTaskClick: (taskId: string) => void
  onAddTask: (columnId: string) => void
  onStatusChange: (taskId: string, status: TaskStatus) => void
  milestones?: Array<{ id: string; name: string }>
}

export function KanbanView({
  tasks,
  agents,
  onTaskClick,
  onAddTask,
  onStatusChange,
  milestones = [],
}: KanbanViewProps) {
  const [draggedTask, setDraggedTask] = useState<Task | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null)
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const [isDragging, setIsDragging] = useState(false)
  const [mouseDownPos, setMouseDownPos] = useState<{ x: number; y: number } | null>(null)
  const [swimlaneMode, setSwimlaneMode] = useState<SwimlaneMode>('none')
  const [collapsedSwimlanes, setCollapsedSwimlanes] = useState<Set<string>>(new Set())
  const [showSwimlaneMenu, setShowSwimlaneMenu] = useState(false)
  const { formatDate: formatDateTz } = useTimezoneFunctions()

  // Get swimlanes based on mode
  const swimlanes = useMemo(() => {
    if (swimlaneMode === 'none') {
      return [{ id: 'all', name: 'All Tasks', tasks }]
    }

    if (swimlaneMode === 'agent') {
      const agentGroups = new Map<string, Task[]>()
      const unassigned: Task[] = []

      tasks.forEach((task) => {
        if (task.assignedTo && task.assignedToType === 'agent') {
          const existing = agentGroups.get(task.assignedTo) || []
          existing.push(task)
          agentGroups.set(task.assignedTo, existing)
        } else {
          unassigned.push(task)
        }
      })

      const lanes = Array.from(agentGroups.entries()).map(([agentId, agentTasks]) => ({
        id: agentId,
        name: agents.get(agentId) || 'Unknown Agent',
        tasks: agentTasks,
        icon: <Bot size={14} className="text-primary-400" />,
      }))

      if (unassigned.length > 0) {
        lanes.push({
          id: 'unassigned',
          name: 'Unassigned',
          tasks: unassigned,
          icon: <User size={14} className="text-surface-400" />,
        })
      }

      return lanes
    }

    if (swimlaneMode === 'priority') {
      const priorities: TaskPriority[] = ['critical', 'high', 'medium', 'low']
      return priorities.map((priority) => ({
        id: priority,
        name: PRIORITY_CONFIG[priority].label,
        tasks: tasks.filter((t) => t.priority === priority),
        color: PRIORITY_CONFIG[priority].color,
      }))
    }

    if (swimlaneMode === 'milestone') {
      const milestoneGroups = new Map<string, Task[]>()
      const noMilestone: Task[] = []

      tasks.forEach((task) => {
        if (task.milestoneId) {
          const existing = milestoneGroups.get(task.milestoneId) || []
          existing.push(task)
          milestoneGroups.set(task.milestoneId, existing)
        } else {
          noMilestone.push(task)
        }
      })

      const lanes = milestones
        .filter((m) => milestoneGroups.has(m.id))
        .map((milestone) => ({
          id: milestone.id,
          name: milestone.name,
          tasks: milestoneGroups.get(milestone.id) || [],
        }))

      if (noMilestone.length > 0) {
        lanes.push({
          id: 'no-milestone',
          name: 'No Milestone',
          tasks: noMilestone,
        })
      }

      return lanes
    }

    return [{ id: 'all', name: 'All Tasks', tasks }]
  }, [swimlaneMode, tasks, agents, milestones])

  // Map of task IDs to titles for parent lookup
  const taskTitleMap = useMemo(() => {
    const map = new Map<string, string>()
    tasks.forEach((task) => {
      map.set(task.id, task.title)
    })
    return map
  }, [tasks])

  const toggleSwimlane = (laneId: string) => {
    setCollapsedSwimlanes((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(laneId)) {
        newSet.delete(laneId)
      } else {
        newSet.add(laneId)
      }
      return newSet
    })
  }

  // Track mousedown position to detect clicks vs drags
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setMouseDownPos({ x: e.clientX, y: e.clientY })
  }, [])

  // Handle task click via mouseup
  const handleTaskMouseUp = useCallback((e: React.MouseEvent, task: Task) => {
    if (isDragging) return

    if (mouseDownPos) {
      const dx = Math.abs(e.clientX - mouseDownPos.x)
      const dy = Math.abs(e.clientY - mouseDownPos.y)
      if (dx > 5 || dy > 5) {
        setMouseDownPos(null)
        return
      }
    }
    setMouseDownPos(null)

    e.stopPropagation()

    const isMultiSelect = e.ctrlKey || e.metaKey

    if (isMultiSelect) {
      setSelectedTaskIds((prev) => {
        const newSet = new Set(prev)
        if (newSet.has(task.id)) {
          newSet.delete(task.id)
        } else {
          newSet.add(task.id)
        }
        return newSet
      })
    } else {
      setSelectedTaskIds(new Set())
      onTaskClick(task.id)
    }
  }, [isDragging, mouseDownPos, onTaskClick])

  const handleTaskSelect = useCallback((e: React.MouseEvent, task: Task) => {
    if (isDragging) return
    if (!mouseDownPos) return

    const isMultiSelect = e.ctrlKey || e.metaKey

    if (isMultiSelect) {
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
    } else {
      setSelectedTaskIds(new Set())
      onTaskClick(task.id)
    }
    setMouseDownPos(null)
  }, [isDragging, mouseDownPos, onTaskClick])

  const handleBackgroundClick = useCallback(() => {
    if (selectedTaskIds.size > 0) {
      setSelectedTaskIds(new Set())
    }
    setShowSwimlaneMenu(false)
  }, [selectedTaskIds])

  const handleDragStart = useCallback((e: React.DragEvent, task: Task) => {
    setIsDragging(true)
    if (selectedTaskIds.has(task.id) && selectedTaskIds.size > 1) {
      const selectedTasks = tasks.filter((t) => selectedTaskIds.has(t.id))
      e.dataTransfer.setData('text/plain', JSON.stringify(selectedTasks.map((t) => t.id)))
      e.dataTransfer.effectAllowed = 'move'
      setDraggedTask(task)
    } else {
      setDraggedTask(task)
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', task.id)
    }
  }, [selectedTaskIds, tasks])

  const handleDragEnd = useCallback(() => {
    setDraggedTask(null)
    setDragOverColumn(null)
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
      e.preventDefault()
      setDragOverColumn(null)
      // Reset drag state immediately on drop - handleDragEnd may not fire
      // if the task card gets unmounted due to the status change re-render
      setDraggedTask(null)
      setTimeout(() => setIsDragging(false), 50)

      if (!draggedTask) return

      const newStatus = COLUMN_TO_STATUS[columnId]
      if (!newStatus) return

      const dataStr = e.dataTransfer.getData('text/plain')
      let taskIdsToMove: string[] = []

      try {
        const parsed = JSON.parse(dataStr)
        if (Array.isArray(parsed)) {
          taskIdsToMove = parsed
        } else {
          taskIdsToMove = [draggedTask.id]
        }
      } catch {
        taskIdsToMove = [draggedTask.id]
      }

      const tasksToMove = tasks.filter((t) => taskIdsToMove.includes(t.id))

      tasksToMove.forEach((task) => {
        const currentColumn = STATUS_TO_COLUMN[task.status]
        if (currentColumn !== columnId) {
          onStatusChange(task.id, newStatus)
        }
      })

      setSelectedTaskIds(new Set())
    },
    [draggedTask, onStatusChange, tasks]
  )

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null
    return formatDateTz(dateStr, 'short')
  }

  // Render a single task card
  const renderTaskCard = (task: Task) => {
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
        {isSelected && (
          <div className="absolute -top-1 -right-1 w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
            ✓
          </div>
        )}

        {task.parentTaskId && (
          <div
            className="flex items-center gap-1 text-xs text-purple-400 mb-1"
            title={`Subtask of: ${taskTitleMap.get(task.parentTaskId) || 'Parent task'}`}
          >
            <Link2 size={12} />
            <span className="truncate max-w-[180px] opacity-75">
              {taskTitleMap.get(task.parentTaskId) || 'Parent task'}
            </span>
          </div>
        )}

        <h4 className="text-sm font-medium text-white line-clamp-2 mb-2">
          {task.title}
        </h4>

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
  }

  // Render column with optional swimlane filtering
  const renderColumn = (column: Column, laneTasks: Task[]) => {
    const columnTasks = laneTasks.filter((t) => STATUS_TO_COLUMN[t.status] === column.id)
    const isDropTarget = dragOverColumn === column.id
    const isOverWipLimit = column.wipLimit && columnTasks.length > column.wipLimit
    const isAtWipLimit = column.wipLimit && columnTasks.length === column.wipLimit

    return (
      <div
        key={column.id}
        className={`flex flex-col flex-1 min-w-[200px] max-w-[320px] rounded-lg border transition-all ${
          isDropTarget
            ? 'border-primary-500 shadow-[0_0_0_2px_rgba(14,165,233,0.2)]'
            : isOverWipLimit
              ? 'border-red-500/50'
              : 'border-surface-700'
        }`}
        style={{ background: '#111118' }}
        onDragOver={(e) => handleDragOver(e, column.id)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, column.id)}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Column Header */}
        <div className={`p-3 border-b ${isOverWipLimit ? 'border-red-500/50 bg-red-500/10' : 'border-surface-700'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white">{column.title}</h3>
              {isOverWipLimit && (
                <AlertTriangle size={14} className="text-red-400" />
              )}
            </div>
            <div className="flex items-center gap-1">
              <span
                className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                  isOverWipLimit
                    ? 'bg-red-500/30 text-red-400'
                    : isAtWipLimit
                      ? 'bg-yellow-500/30 text-yellow-400'
                      : 'bg-surface-700 text-surface-400'
                }`}
              >
                {columnTasks.length}
                {column.wipLimit && `/${column.wipLimit}`}
              </span>
            </div>
          </div>
          {isOverWipLimit && (
            <p className="text-xs text-red-400 mt-1">
              WIP limit exceeded!
            </p>
          )}
        </div>

        {/* Card List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[100px]">
          {columnTasks.map(renderTaskCard)}

          {columnTasks.length === 0 && (
            <div className="flex items-center justify-center py-8 text-surface-500 text-sm">
              No tasks
            </div>
          )}
        </div>

        {/* Add Task Button - only show in single swimlane mode */}
        {swimlaneMode === 'none' && (
          <button
            onClick={() => onAddTask(column.id)}
            className="flex items-center justify-center gap-1 w-full p-2 border-t border-surface-700 text-surface-400 text-sm font-medium hover:bg-surface-800 hover:text-primary-400 transition-colors"
          >
            <span className="text-lg leading-none">+</span>
            <span>Add Task</span>
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="h-full w-full overflow-auto relative" style={{ background: '#0a0a0f' }} onClick={handleBackgroundClick}>
      {/* Toolbar */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-4 py-2 border-b border-surface-700" style={{ background: '#0a0a0f' }}>
        <div className="flex items-center gap-2">
          {/* Swimlane Mode Selector */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowSwimlaneMenu(!showSwimlaneMenu)
              }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                swimlaneMode !== 'none'
                  ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                  : 'bg-surface-800 text-surface-300 border border-surface-700 hover:border-surface-600'
              }`}
            >
              <Layers size={14} />
              <span>
                {swimlaneMode === 'none' ? 'Swimlanes' :
                 swimlaneMode === 'agent' ? 'By Agent' :
                 swimlaneMode === 'priority' ? 'By Priority' :
                 'By Milestone'}
              </span>
              <ChevronDown size={14} />
            </button>

            {showSwimlaneMenu && (
              <div className="absolute top-full left-0 mt-1 w-40 bg-surface-800 border border-surface-700 rounded-lg shadow-xl z-30">
                <button
                  onClick={() => {
                    setSwimlaneMode('none')
                    setShowSwimlaneMenu(false)
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-surface-700 ${swimlaneMode === 'none' ? 'text-primary-400' : 'text-surface-300'}`}
                >
                  <ArrowUpDown size={14} />
                  None
                </button>
                <button
                  onClick={() => {
                    setSwimlaneMode('agent')
                    setShowSwimlaneMenu(false)
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-surface-700 ${swimlaneMode === 'agent' ? 'text-primary-400' : 'text-surface-300'}`}
                >
                  <Bot size={14} />
                  By Agent
                </button>
                <button
                  onClick={() => {
                    setSwimlaneMode('priority')
                    setShowSwimlaneMenu(false)
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-surface-700 ${swimlaneMode === 'priority' ? 'text-primary-400' : 'text-surface-300'}`}
                >
                  <AlertTriangle size={14} />
                  By Priority
                </button>
                {milestones.length > 0 && (
                  <button
                    onClick={() => {
                      setSwimlaneMode('milestone')
                      setShowSwimlaneMenu(false)
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-surface-700 ${swimlaneMode === 'milestone' ? 'text-primary-400' : 'text-surface-300'}`}
                  >
                    <Layers size={14} />
                    By Milestone
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* WIP Legend */}
        <div className="flex items-center gap-4 text-xs text-surface-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-yellow-500/30"></span>
            At limit
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-red-500/30"></span>
            Over limit
          </span>
        </div>
      </div>

      {/* Multi-select indicator */}
      {selectedTaskIds.size > 0 && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-full shadow-lg flex items-center gap-2">
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

      {/* Board Content */}
      {swimlaneMode === 'none' ? (
        // Standard view - no swimlanes
        <div className="flex gap-3 p-4 min-w-fit">
          {DEFAULT_COLUMNS.map((column) => renderColumn(column, tasks))}
        </div>
      ) : (
        // Swimlane view
        <div className="p-4 space-y-4">
          {swimlanes.map((lane) => {
            const isCollapsed = collapsedSwimlanes.has(lane.id)
            const laneTaskCount = lane.tasks.length

            return (
              <div key={lane.id} className="border border-surface-700 rounded-lg overflow-hidden" style={{ background: '#111118' }}>
                {/* Swimlane Header */}
                <button
                  onClick={() => toggleSwimlane(lane.id)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-surface-800/50 hover:bg-surface-800 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <ChevronDown
                      size={16}
                      className={`text-surface-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                    />
                    <div className="flex items-center gap-2">
                      {'icon' in lane && lane.icon}
                      <span className="font-medium text-white">{lane.name}</span>
                    </div>
                    {'color' in lane && (
                      <span className={`px-2 py-0.5 text-xs rounded-full ${lane.color}`}>
                        {lane.name}
                      </span>
                    )}
                  </div>
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-surface-700 text-surface-400">
                    {laneTaskCount} tasks
                  </span>
                </button>

                {/* Swimlane Content */}
                {!isCollapsed && (
                  <div className="flex gap-3 p-4 overflow-x-auto min-w-fit">
                    {DEFAULT_COLUMNS.map((column) => renderColumn(column, lane.tasks))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default KanbanView
