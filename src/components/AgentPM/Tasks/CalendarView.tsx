// Calendar View - Monthly calendar showing tasks by due date

import { useState, useMemo } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Circle,
} from 'lucide-react'
import type { Task } from '@/types/agentpm'

interface CalendarViewProps {
  tasks: Task[]
  onTaskClick?: (taskId: string) => void
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#71717a',
  queued: '#f59e0b',
  in_progress: '#0ea5e9',
  review: '#8b5cf6',
  completed: '#22c55e',
  failed: '#ef4444',
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f59e0b',
  medium: '#3b82f6',
  low: '#71717a',
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  )
}

function isToday(date: Date): boolean {
  return isSameDay(date, new Date())
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

export function CalendarView({ tasks, onTaskClick }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  // Group tasks by date
  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>()

    for (const task of tasks) {
      // Use due date, or fallback to scheduled end date
      const dateStr = task.dueAt || task.scheduledEndDate || task.calculatedEndDate
      if (dateStr) {
        const date = new Date(dateStr)
        const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
        if (!map.has(key)) {
          map.set(key, [])
        }
        map.get(key)!.push(task)
      }
    }

    return map
  }, [tasks])

  // Generate calendar grid
  const calendarDays = useMemo(() => {
    const daysInMonth = getDaysInMonth(year, month)
    const firstDay = getFirstDayOfMonth(year, month)
    const days: { date: Date; isCurrentMonth: boolean }[] = []

    // Previous month days
    const prevMonthDays = getDaysInMonth(year, month - 1)
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthDays - i),
        isCurrentMonth: false,
      })
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true,
      })
    }

    // Next month days (fill to 6 rows)
    const remainingDays = 42 - days.length // 6 rows * 7 days
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false,
      })
    }

    return days
  }, [year, month])

  const goToPreviousMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
    setSelectedDate(null)
  }

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
    setSelectedDate(null)
  }

  const goToToday = () => {
    setCurrentDate(new Date())
    setSelectedDate(new Date())
  }

  // Get tasks for selected date
  const selectedDateTasks = useMemo(() => {
    if (!selectedDate) return []
    const key = `${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}`
    return tasksByDate.get(key) || []
  }, [selectedDate, tasksByDate])

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-surface-500">
        <Calendar size={48} className="mb-4 opacity-50" />
        <p className="text-lg">No tasks to display</p>
        <p className="text-sm">Create tasks with due dates to see them on the calendar</p>
      </div>
    )
  }

  return (
    <div className="flex h-full bg-white dark:bg-surface-900">
      {/* Calendar Grid */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200 dark:border-surface-700">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold text-surface-900 dark:text-surface-100">
              {MONTHS[month]} {year}
            </h2>
            <div className="flex items-center gap-1">
              <button
                onClick={goToPreviousMonth}
                className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-600 dark:text-surface-400 transition-colors"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={goToNextMonth}
                className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-600 dark:text-surface-400 transition-colors"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>

          <button
            onClick={goToToday}
            className="px-3 py-1.5 text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
          >
            Today
          </button>
        </div>

        {/* Day Headers */}
        <div className="grid grid-cols-7 border-b border-surface-200 dark:border-surface-700">
          {DAYS_OF_WEEK.map((day) => (
            <div
              key={day}
              className="py-2 text-center text-sm font-medium text-surface-500 dark:text-surface-400"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="flex-1 grid grid-cols-7 auto-rows-fr">
          {calendarDays.map(({ date, isCurrentMonth }, index) => {
            const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
            const dayTasks = tasksByDate.get(key) || []
            const isSelected = selectedDate && isSameDay(date, selectedDate)
            const isTodayDate = isToday(date)

            return (
              <div
                key={index}
                onClick={() => setSelectedDate(date)}
                className={`
                  min-h-[100px] p-1.5 border-r border-b border-surface-100 dark:border-surface-800 cursor-pointer
                  transition-colors
                  ${!isCurrentMonth ? 'bg-surface-50/50 dark:bg-surface-950/50' : ''}
                  ${isSelected ? 'bg-primary-50 dark:bg-primary-900/20' : 'hover:bg-surface-50 dark:hover:bg-surface-800/50'}
                `}
              >
                {/* Day Number */}
                <div className="flex items-start justify-between mb-1">
                  <span
                    className={`
                      inline-flex items-center justify-center w-7 h-7 text-sm rounded-full
                      ${isTodayDate ? 'bg-primary-500 text-white font-medium' : ''}
                      ${!isTodayDate && isCurrentMonth ? 'text-surface-700 dark:text-surface-300' : ''}
                      ${!isTodayDate && !isCurrentMonth ? 'text-surface-400 dark:text-surface-600' : ''}
                    `}
                  >
                    {date.getDate()}
                  </span>
                  {dayTasks.length > 0 && (
                    <span className="text-xs text-surface-500 dark:text-surface-400">
                      {dayTasks.length}
                    </span>
                  )}
                </div>

                {/* Task Dots/Pills */}
                <div className="space-y-0.5 overflow-hidden">
                  {dayTasks.slice(0, 3).map((task) => (
                    <div
                      key={task.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        onTaskClick?.(task.id)
                      }}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs truncate hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors"
                      style={{ backgroundColor: `${STATUS_COLORS[task.status]}20` }}
                    >
                      <Circle
                        size={6}
                        fill={PRIORITY_COLORS[task.priority]}
                        stroke="none"
                        className="flex-shrink-0"
                      />
                      <span className="truncate text-surface-700 dark:text-surface-300">
                        {task.title}
                      </span>
                    </div>
                  ))}
                  {dayTasks.length > 3 && (
                    <div className="text-xs text-surface-500 dark:text-surface-400 px-1.5">
                      +{dayTasks.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Selected Date Panel */}
      {selectedDate && (
        <div className="w-80 border-l border-surface-200 dark:border-surface-700 flex flex-col">
          {/* Panel Header */}
          <div className="px-4 py-3 border-b border-surface-200 dark:border-surface-700">
            <h3 className="font-medium text-surface-900 dark:text-surface-100">
              {selectedDate.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </h3>
            <p className="text-sm text-surface-500 dark:text-surface-400">
              {selectedDateTasks.length} task{selectedDateTasks.length !== 1 ? 's' : ''} due
            </p>
          </div>

          {/* Task List */}
          <div className="flex-1 overflow-auto p-3 space-y-2">
            {selectedDateTasks.length === 0 ? (
              <div className="text-center py-8 text-surface-500 dark:text-surface-400">
                <Calendar size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">No tasks due on this date</p>
              </div>
            ) : (
              selectedDateTasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => onTaskClick?.(task.id)}
                  className="p-3 rounded-lg border border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-800 cursor-pointer transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <div
                      className="w-1 h-full min-h-[40px] rounded-full flex-shrink-0"
                      style={{ backgroundColor: PRIORITY_COLORS[task.priority] }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-surface-900 dark:text-surface-100 truncate">
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="text-sm text-surface-500 dark:text-surface-400 truncate mt-0.5">
                          {task.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <span
                          className="px-2 py-0.5 rounded text-xs font-medium"
                          style={{
                            backgroundColor: `${STATUS_COLORS[task.status]}20`,
                            color: STATUS_COLORS[task.status],
                          }}
                        >
                          {task.status.replace('_', ' ')}
                        </span>
                        <span
                          className="px-2 py-0.5 rounded text-xs font-medium"
                          style={{
                            backgroundColor: `${PRIORITY_COLORS[task.priority]}20`,
                            color: PRIORITY_COLORS[task.priority],
                          }}
                        >
                          {task.priority}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 flex items-center gap-4 px-3 py-2 rounded-lg bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 shadow-sm">
        <span className="text-xs text-surface-500">Priority:</span>
        {Object.entries(PRIORITY_COLORS).map(([priority, color]) => (
          <div key={priority} className="flex items-center gap-1">
            <Circle size={8} fill={color} stroke="none" />
            <span className="text-xs text-surface-600 dark:text-surface-400 capitalize">{priority}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default CalendarView
