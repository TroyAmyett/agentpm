// Kanban View - Enhanced Kanban board for AgentPM tasks
// Supports: multi-select drag, swimlanes, WIP limits

import { useState, useMemo, useCallback } from 'react'
import { Link2, AlertTriangle, ArrowUp, Minus, ArrowDown, Bot, User, ChevronDown, Layers, ArrowUpDown, Calendar, CheckCircle2 } from 'lucide-react'
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

// Priority config for badges - Lucide icons, no emoji
const PRIORITY_CONFIG: Record<TaskPriority, { icon: React.ReactNode; color: string; borderColor: string; label: string; order: number }> = {
  critical: { icon: <AlertTriangle size={11} />, color: 'bg-red-500/10 text-red-400', borderColor: 'border-red-500/20', label: 'Critical', order: 0 },
  high: { icon: <ArrowUp size={11} />, color: 'bg-orange-500/10 text-orange-400', borderColor: 'border-orange-500/20', label: 'High', order: 1 },
  medium: { icon: <Minus size={11} />, color: 'bg-yellow-500/10 text-yellow-400', borderColor: 'border-yellow-500/20', label: 'Medium', order: 2 },
  low: { icon: <ArrowDown size={11} />, color: 'bg-surface-500/10 text-surface-400', borderColor: 'border-surface-500/20', label: 'Low', order: 3 },
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

  // Map of parent task IDs to subtask count
  const subtaskCountMap = useMemo(() => {
    const map = new Map<string, number>()
    tasks.forEach((task) => {
      if (task.parentTaskId) {
        map.set(task.parentTaskId, (map.get(task.parentTaskId) || 0) + 1)
      }
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

  const formatRelativeTime = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr}h ago`
    const diffDays = Math.floor(diffHr / 24)
    if (diffDays === 1) return 'yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    return d.toLocaleDateString()
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
        className={`group p-3 rounded-xl cursor-grab active:cursor-grabbing transition-all duration-200 border relative ${
          isSelected
            ? 'border-primary-500 ring-2 ring-primary-500/30'
            : 'border-white/[0.06] hover:border-primary-500/30 hover:shadow-card-hover hover:-translate-y-0.5'
        } ${isBeingDragged ? 'opacity-50' : ''}`}
        style={{
          background: isSelected
            ? 'rgba(14, 165, 233, 0.08)'
            : 'rgba(24, 24, 27, 0.6)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        {isSelected && (
          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center shadow-glow-sm">
            <CheckCircle2 size={12} className="text-white" />
          </div>
        )}

        {task.parentTaskId && (
          <div
            className="flex items-center gap-1 text-xs text-purple-400/80 mb-1.5"
            title={`Subtask of: ${taskTitleMap.get(task.parentTaskId) || 'Parent task'}`}
          >
            <Link2 size={10} />
            <span className="truncate max-w-[180px]">
              {taskTitleMap.get(task.parentTaskId) || 'Parent task'}
            </span>
          </div>
        )}

        <h4 className="text-sm font-medium text-surface-100 line-clamp-2 mb-2">
          {task.title}
        </h4>

        {/* Subtask count for parent tasks */}
        {subtaskCountMap.has(task.id) && (
          <div className="flex items-center gap-1 text-xs text-cyan-400 mb-2">
            <Layers size={12} />
            <span>{subtaskCountMap.get(task.id)} subtask{subtaskCountMap.get(task.id)! > 1 ? 's' : ''}</span>
          </div>
        )}

        <div className="flex items-center flex-wrap gap-1.5 mb-2">
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded-md border ${priority.color} ${priority.borderColor}`}>
            {priority.icon} {priority.label}
          </span>

          {assigneeName && (
            <div className="flex items-center gap-1 text-xs text-surface-400">
              {isAgent ? <Bot size={12} className="text-primary-400" /> : <User size={12} />}
              <span className="max-w-[80px] truncate">{assigneeName}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-surface-500">
          {task.dueAt ? (
            <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-400' : ''}`}>
              <Calendar size={11} />
              {formatDate(task.dueAt)}
            </span>
          ) : (
            <span>{formatRelativeTime(task.createdAt)}</span>
          )}
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
        className={`flex flex-col flex-1 min-w-[200px] max-w-[320px] rounded-xl border transition-all ${
          isDropTarget
            ? 'border-primary-500/50 shadow-glow-md'
            : isOverWipLimit
              ? 'border-red-500/30'
              : 'border-white/[0.06]'
        }`}
        style={{
          background: 'rgba(24, 24, 27, 0.4)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
        onDragOver={(e) => handleDragOver(e, column.id)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, column.id)}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Column Header */}
        <div className={`p-3 border-b ${isOverWipLimit ? 'border-red-500/30 bg-red-500/5' : 'border-white/[0.06]'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-surface-200">{column.title}</h3>
              {isOverWipLimit && (
                <AlertTriangle size={14} className="text-red-400" />
              )}
            </div>
            <div className="flex items-center gap-1">
              <span
                className={`px-2 py-0.5 text-xs font-medium rounded-md border ${
                  isOverWipLimit
                    ? 'bg-red-500/10 text-red-400 border-red-500/20'
                    : isAtWipLimit
                      ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                      : 'bg-surface-500/10 text-surface-400 border-white/[0.06]'
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
            className="flex items-center justify-center gap-1 w-full p-2 border-t border-white/[0.06] text-surface-400 text-sm font-medium hover:bg-primary-500/5 hover:text-primary-400 transition-colors rounded-b-xl"
          >
            <span className="text-lg leading-none">+</span>
            <span>Add Task</span>
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      className="h-full w-full overflow-auto relative grid-pattern"
      style={{ background: 'var(--fl-color-bg-base)' }}
      onClick={handleBackgroundClick}
    >
      {/* Toolbar */}
      <div
        className="sticky top-0 z-20 flex items-center justify-between px-4 py-2 border-b border-white/[0.06] glass-header"
      >
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
                  ? 'bg-primary-500/15 text-primary-400 border border-primary-500/25'
                  : 'bg-surface-800/50 text-surface-300 border border-white/[0.08] hover:border-white/[0.15]'
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
              <div className="absolute top-full left-0 mt-1 w-40 rounded-lg shadow-elevated border border-white/[0.08] overflow-hidden"
                style={{ background: 'rgba(24, 24, 27, 0.95)', backdropFilter: 'blur(16px)' }}
              >
                <button
                  onClick={() => {
                    setSwimlaneMode('none')
                    setShowSwimlaneMenu(false)
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-white/[0.05] ${swimlaneMode === 'none' ? 'text-primary-400' : 'text-surface-300'}`}
                >
                  <ArrowUpDown size={14} />
                  None
                </button>
                <button
                  onClick={() => {
                    setSwimlaneMode('agent')
                    setShowSwimlaneMenu(false)
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-white/[0.05] ${swimlaneMode === 'agent' ? 'text-primary-400' : 'text-surface-300'}`}
                >
                  <Bot size={14} />
                  By Agent
                </button>
                <button
                  onClick={() => {
                    setSwimlaneMode('priority')
                    setShowSwimlaneMenu(false)
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-white/[0.05] ${swimlaneMode === 'priority' ? 'text-primary-400' : 'text-surface-300'}`}
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
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-white/[0.05] ${swimlaneMode === 'milestone' ? 'text-primary-400' : 'text-surface-300'}`}
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
            <span className="w-3 h-3 rounded bg-yellow-500/20 border border-yellow-500/30"></span>
            At limit
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-red-500/20 border border-red-500/30"></span>
            Over limit
          </span>
        </div>
      </div>

      {/* Multi-select indicator */}
      {selectedTaskIds.size > 0 && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-full shadow-glow-md flex items-center gap-2">
          <span>{selectedTaskIds.size} tasks selected</span>
          <span className="text-primary-200">Drag to move all</span>
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
              <div
                key={lane.id}
                className="border border-white/[0.06] rounded-xl overflow-hidden"
                style={{
                  background: 'rgba(24, 24, 27, 0.3)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                }}
              >
                {/* Swimlane Header */}
                <button
                  onClick={() => toggleSwimlane(lane.id)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <ChevronDown
                      size={16}
                      className={`text-surface-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                    />
                    <div className="flex items-center gap-2">
                      {'icon' in lane && lane.icon}
                      <span className="font-medium text-surface-200">{lane.name}</span>
                    </div>
                    {'color' in lane && (
                      <span className={`px-2 py-0.5 text-xs rounded-md border ${lane.color} border-white/[0.1]`}>
                        {lane.name}
                      </span>
                    )}
                  </div>
                  <span className="px-2 py-0.5 text-xs font-medium rounded-md bg-surface-500/10 text-surface-400 border border-white/[0.06]">
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
