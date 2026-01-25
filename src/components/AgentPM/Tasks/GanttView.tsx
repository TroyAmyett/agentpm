// Gantt View - Timeline visualization of tasks with dependencies

import { useState, useEffect, useMemo, useRef } from 'react'
import { Calendar } from 'lucide-react'
import type { Task, TaskDependency } from '@/types/agentpm'
import * as db from '@/services/agentpm/database'

interface GanttViewProps {
  tasks: Task[]
  onTaskClick?: (taskId: string) => void
}

type ZoomLevel = 'day' | 'week' | 'month'

const STATUS_COLORS: Record<string, string> = {
  pending: '#71717a',      // gray
  queued: '#f59e0b',       // amber
  in_progress: '#0ea5e9',  // cyan (primary)
  review: '#8b5cf6',       // purple
  completed: '#22c55e',    // green (secondary)
  failed: '#ef4444',       // red
}

const PRIORITY_INDICATORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f59e0b',
  medium: '#3b82f6',
  low: '#71717a',
}

const ROW_HEIGHT = 48
const LABEL_WIDTH = 280
const DAY_WIDTH = 40
const WEEK_WIDTH = 120
const MONTH_WIDTH = 160

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function diffDays(date1: Date, date2: Date): number {
  const oneDay = 24 * 60 * 60 * 1000
  return Math.round((date1.getTime() - date2.getTime()) / oneDay)
}

function startOfDay(date: Date): Date {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

function startOfWeek(date: Date): Date {
  const result = new Date(date)
  const day = result.getDay()
  result.setDate(result.getDate() - day)
  result.setHours(0, 0, 0, 0)
  return result
}

function startOfMonth(date: Date): Date {
  const result = new Date(date)
  result.setDate(1)
  result.setHours(0, 0, 0, 0)
  return result
}

export function GanttView({ tasks, onTaskClick }: GanttViewProps) {
  const [dependencies, setDependencies] = useState<TaskDependency[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('week')
  const containerRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)

  // Fetch all dependencies
  useEffect(() => {
    async function loadDependencies() {
      setIsLoading(true)
      try {
        const allDeps: TaskDependency[] = []
        for (const task of tasks) {
          const deps = await db.fetchTaskDependencies(task.id)
          allDeps.push(...deps)
        }
        setDependencies(allDeps)
      } catch (err) {
        console.error('Failed to load dependencies:', err)
      } finally {
        setIsLoading(false)
      }
    }
    loadDependencies()
  }, [tasks])

  // Calculate date range and task positions
  const { dateRange, taskBars, dependencyLines, gridUnits } = useMemo(() => {
    const today = startOfDay(new Date())

    // Find date range from tasks
    let minDate = addDays(today, -7) // Start a week before today
    let maxDate = addDays(today, 30) // Default to a month ahead

    for (const task of tasks) {
      const startDate = task.scheduledStartDate || task.calculatedStartDate || task.startedAt || task.createdAt
      const endDate = task.scheduledEndDate || task.calculatedEndDate || task.dueAt || task.completedAt

      if (startDate) {
        const start = startOfDay(new Date(startDate))
        if (start < minDate) minDate = start
      }
      if (endDate) {
        const end = startOfDay(new Date(endDate))
        if (end > maxDate) maxDate = end
      }
    }

    // Add padding
    minDate = addDays(minDate, -7)
    maxDate = addDays(maxDate, 14)

    // Generate grid units based on zoom level
    const gridUnits: { date: Date; label: string; isToday: boolean }[] = []
    let currentDate = new Date(minDate)

    while (currentDate <= maxDate) {
      const isToday = diffDays(currentDate, today) === 0

      if (zoomLevel === 'day') {
        gridUnits.push({
          date: new Date(currentDate),
          label: formatDate(currentDate),
          isToday,
        })
        currentDate = addDays(currentDate, 1)
      } else if (zoomLevel === 'week') {
        const weekStart = startOfWeek(currentDate)
        const weekEnd = addDays(weekStart, 6)
        gridUnits.push({
          date: new Date(weekStart),
          label: `${formatDate(weekStart)} - ${formatDate(weekEnd)}`,
          isToday: diffDays(weekStart, today) <= 0 && diffDays(weekEnd, today) >= 0,
        })
        currentDate = addDays(weekStart, 7)
      } else {
        const monthStart = startOfMonth(currentDate)
        gridUnits.push({
          date: new Date(monthStart),
          label: monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
          isToday: monthStart.getMonth() === today.getMonth() && monthStart.getFullYear() === today.getFullYear(),
        })
        currentDate = new Date(monthStart)
        currentDate.setMonth(currentDate.getMonth() + 1)
      }
    }

    // Calculate task bars
    const taskBars: {
      taskId: string
      task: Task
      left: number
      width: number
      rowIndex: number
      color: string
      priorityColor: string
    }[] = []

    const sortedTasks = [...tasks].sort((a, b) => {
      // Sort by priority, then by start date
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
      const aPriority = priorityOrder[a.priority] ?? 2
      const bPriority = priorityOrder[b.priority] ?? 2
      if (aPriority !== bPriority) return aPriority - bPriority

      const aStart = new Date(a.scheduledStartDate || a.calculatedStartDate || a.startedAt || a.createdAt)
      const bStart = new Date(b.scheduledStartDate || b.calculatedStartDate || b.startedAt || b.createdAt)
      return aStart.getTime() - bStart.getTime()
    })

    sortedTasks.forEach((task, index) => {
      const startDate = startOfDay(new Date(
        task.scheduledStartDate || task.calculatedStartDate || task.startedAt || task.createdAt
      ))
      const endDate = startOfDay(new Date(
        task.scheduledEndDate || task.calculatedEndDate || task.dueAt || task.completedAt || addDays(startDate, task.estimatedHours ? Math.ceil(task.estimatedHours / 8) : 3)
      ))

      // Calculate position based on grid
      let left = 0
      let width = 0

      if (zoomLevel === 'day') {
        left = diffDays(startDate, minDate) * DAY_WIDTH
        width = Math.max(1, diffDays(endDate, startDate) + 1) * DAY_WIDTH - 8
      } else if (zoomLevel === 'week') {
        const daysFromStart = diffDays(startDate, minDate)
        left = (daysFromStart / 7) * WEEK_WIDTH
        const duration = diffDays(endDate, startDate) + 1
        width = Math.max(20, (duration / 7) * WEEK_WIDTH)
      } else {
        const monthsFromStart = (startDate.getFullYear() - minDate.getFullYear()) * 12 + startDate.getMonth() - minDate.getMonth()
        left = monthsFromStart * MONTH_WIDTH + (startDate.getDate() / 30) * MONTH_WIDTH
        const durationDays = diffDays(endDate, startDate) + 1
        width = Math.max(20, (durationDays / 30) * MONTH_WIDTH)
      }

      taskBars.push({
        taskId: task.id,
        task,
        left,
        width,
        rowIndex: index,
        color: STATUS_COLORS[task.status] || STATUS_COLORS.pending,
        priorityColor: PRIORITY_INDICATORS[task.priority] || PRIORITY_INDICATORS.medium,
      })
    })

    // Calculate dependency lines
    const dependencyLines: {
      fromTaskId: string
      toTaskId: string
      x1: number
      y1: number
      x2: number
      y2: number
    }[] = []

    const taskBarMap = new Map(taskBars.map(tb => [tb.taskId, tb]))

    for (const dep of dependencies) {
      const fromBar = taskBarMap.get(dep.dependsOnTaskId)
      const toBar = taskBarMap.get(dep.taskId)

      if (fromBar && toBar) {
        dependencyLines.push({
          fromTaskId: dep.dependsOnTaskId,
          toTaskId: dep.taskId,
          x1: fromBar.left + fromBar.width,
          y1: fromBar.rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2,
          x2: toBar.left,
          y2: toBar.rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2,
        })
      }
    }

    return {
      dateRange: { start: minDate, end: maxDate },
      taskBars,
      dependencyLines,
      gridUnits,
    }
  }, [tasks, dependencies, zoomLevel])

  const unitWidth = zoomLevel === 'day' ? DAY_WIDTH : zoomLevel === 'week' ? WEEK_WIDTH : MONTH_WIDTH
  const timelineWidth = gridUnits.length * unitWidth

  // Scroll to today on initial load
  useEffect(() => {
    if (timelineRef.current && !isLoading) {
      const today = startOfDay(new Date())
      let todayOffset = 0

      if (zoomLevel === 'day') {
        todayOffset = diffDays(today, dateRange.start) * DAY_WIDTH
      } else if (zoomLevel === 'week') {
        todayOffset = (diffDays(today, dateRange.start) / 7) * WEEK_WIDTH
      } else {
        const monthsDiff = (today.getFullYear() - dateRange.start.getFullYear()) * 12 + today.getMonth() - dateRange.start.getMonth()
        todayOffset = monthsDiff * MONTH_WIDTH
      }

      const containerWidth = containerRef.current?.clientWidth || 800
      timelineRef.current.scrollLeft = Math.max(0, todayOffset - containerWidth / 3)
    }
  }, [isLoading, zoomLevel, dateRange.start])

  const scrollToToday = () => {
    if (timelineRef.current) {
      const today = startOfDay(new Date())
      let todayOffset = 0

      if (zoomLevel === 'day') {
        todayOffset = diffDays(today, dateRange.start) * DAY_WIDTH
      } else if (zoomLevel === 'week') {
        todayOffset = (diffDays(today, dateRange.start) / 7) * WEEK_WIDTH
      } else {
        const monthsDiff = (today.getFullYear() - dateRange.start.getFullYear()) * 12 + today.getMonth() - dateRange.start.getMonth()
        todayOffset = monthsDiff * MONTH_WIDTH
      }

      const containerWidth = containerRef.current?.clientWidth || 800
      timelineRef.current.scrollTo({
        left: Math.max(0, todayOffset - containerWidth / 3),
        behavior: 'smooth',
      })
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-surface-500">
        <Calendar size={48} className="mb-4 opacity-50" />
        <p className="text-lg">No tasks to display</p>
        <p className="text-sm">Create tasks with due dates to see them on the timeline</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex flex-col h-full bg-white dark:bg-surface-900">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-surface-200 dark:border-surface-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-surface-500 dark:text-surface-400">Zoom:</span>
          <div className="flex rounded-lg border border-surface-200 dark:border-surface-700 overflow-hidden">
            {(['day', 'week', 'month'] as ZoomLevel[]).map((level) => (
              <button
                key={level}
                onClick={() => setZoomLevel(level)}
                className={`px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  zoomLevel === level
                    ? 'bg-primary-500 text-white'
                    : 'bg-white dark:bg-surface-800 text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-700'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={scrollToToday}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
          >
            <Calendar size={16} />
            Today
          </button>
        </div>
      </div>

      {/* Gantt Chart */}
      <div className="flex-1 overflow-hidden flex">
        {/* Fixed Task Labels */}
        <div className="flex-shrink-0 border-r border-surface-200 dark:border-surface-700" style={{ width: LABEL_WIDTH }}>
          {/* Header */}
          <div className="h-10 px-4 flex items-center border-b border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800">
            <span className="text-sm font-medium text-surface-700 dark:text-surface-300">Task</span>
          </div>

          {/* Task Names */}
          <div className="overflow-hidden">
            {taskBars.map(({ task, priorityColor }) => (
              <div
                key={task.id}
                onClick={() => onTaskClick?.(task.id)}
                className="flex items-center gap-2 px-4 border-b border-surface-100 dark:border-surface-800 hover:bg-surface-50 dark:hover:bg-surface-800 cursor-pointer transition-colors"
                style={{ height: ROW_HEIGHT }}
              >
                <div
                  className="w-1 h-6 rounded-full flex-shrink-0"
                  style={{ backgroundColor: priorityColor }}
                />
                <span className="text-sm text-surface-700 dark:text-surface-300 truncate">
                  {task.title}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Scrollable Timeline */}
        <div
          ref={timelineRef}
          className="flex-1 overflow-x-auto overflow-y-hidden"
        >
          {/* Timeline Header */}
          <div className="sticky top-0 bg-surface-50 dark:bg-surface-800 border-b border-surface-200 dark:border-surface-700 z-10" style={{ width: timelineWidth }}>
            <div className="h-10 flex">
              {gridUnits.map((unit, index) => (
                <div
                  key={index}
                  className={`flex-shrink-0 flex items-center justify-center text-xs font-medium border-r border-surface-200 dark:border-surface-700 ${
                    unit.isToday
                      ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                      : 'text-surface-500 dark:text-surface-400'
                  }`}
                  style={{ width: unitWidth }}
                >
                  {unit.label}
                </div>
              ))}
            </div>
          </div>

          {/* Timeline Body */}
          <div className="relative" style={{ width: timelineWidth, height: taskBars.length * ROW_HEIGHT }}>
            {/* Grid Lines */}
            {gridUnits.map((unit, index) => (
              <div
                key={index}
                className={`absolute top-0 bottom-0 border-r ${
                  unit.isToday
                    ? 'border-primary-300 dark:border-primary-700 bg-primary-50/50 dark:bg-primary-900/10'
                    : 'border-surface-100 dark:border-surface-800'
                }`}
                style={{ left: index * unitWidth, width: unitWidth }}
              />
            ))}

            {/* Row Lines */}
            {taskBars.map((_, index) => (
              <div
                key={index}
                className="absolute left-0 right-0 border-b border-surface-100 dark:border-surface-800"
                style={{ top: (index + 1) * ROW_HEIGHT }}
              />
            ))}

            {/* Dependency Lines (SVG) */}
            <svg className="absolute top-0 left-0 pointer-events-none" style={{ width: timelineWidth, height: taskBars.length * ROW_HEIGHT }}>
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="10"
                  markerHeight="7"
                  refX="9"
                  refY="3.5"
                  orient="auto"
                >
                  <polygon
                    points="0 0, 10 3.5, 0 7"
                    fill="var(--fl-color-text-muted, #71717a)"
                  />
                </marker>
              </defs>
              {dependencyLines.map((line, index) => {
                // Draw a path with a bend
                const midX = (line.x1 + line.x2) / 2
                const path = `M ${line.x1} ${line.y1} C ${midX} ${line.y1}, ${midX} ${line.y2}, ${line.x2} ${line.y2}`

                return (
                  <path
                    key={index}
                    d={path}
                    fill="none"
                    stroke="var(--fl-color-text-muted, #71717a)"
                    strokeWidth="1.5"
                    strokeDasharray="4,2"
                    markerEnd="url(#arrowhead)"
                    opacity={0.6}
                  />
                )
              })}
            </svg>

            {/* Task Bars */}
            {taskBars.map(({ taskId, task, left, width, rowIndex, color }) => (
              <div
                key={taskId}
                onClick={() => onTaskClick?.(taskId)}
                className="absolute flex items-center rounded cursor-pointer transition-all hover:ring-2 hover:ring-primary-400 hover:ring-offset-1 dark:hover:ring-offset-surface-900"
                style={{
                  left: left + 4,
                  top: rowIndex * ROW_HEIGHT + 8,
                  width: Math.max(width - 8, 16),
                  height: ROW_HEIGHT - 16,
                  backgroundColor: color,
                }}
                title={`${task.title}\nStatus: ${task.status}\nPriority: ${task.priority}`}
              >
                <span className="px-2 text-xs text-white font-medium truncate">
                  {width > 60 ? task.title : ''}
                </span>
              </div>
            ))}

            {/* Today Line */}
            {(() => {
              const today = startOfDay(new Date())
              let todayX = 0

              if (zoomLevel === 'day') {
                todayX = diffDays(today, dateRange.start) * DAY_WIDTH + DAY_WIDTH / 2
              } else if (zoomLevel === 'week') {
                todayX = (diffDays(today, dateRange.start) / 7) * WEEK_WIDTH
              } else {
                const monthsDiff = (today.getFullYear() - dateRange.start.getFullYear()) * 12 + today.getMonth() - dateRange.start.getMonth()
                todayX = monthsDiff * MONTH_WIDTH + (today.getDate() / 30) * MONTH_WIDTH
              }

              return (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20"
                  style={{ left: todayX }}
                >
                  <div className="absolute -top-1 -left-1.5 w-3 h-3 rounded-full bg-red-500" />
                </div>
              )
            })()}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 px-4 py-2 border-t border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 flex-shrink-0">
        <span className="text-xs text-surface-500 dark:text-surface-400">Status:</span>
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: color }} />
            <span className="text-xs text-surface-600 dark:text-surface-300 capitalize">{status.replace('_', ' ')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default GanttView
