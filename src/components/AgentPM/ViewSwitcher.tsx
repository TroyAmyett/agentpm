// View Switcher - Dropdown to switch between task views

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LayoutGrid, List, Bot, ChevronDown, Check, GitBranch, GanttChart, Calendar, Zap, Workflow } from 'lucide-react'
import type { TaskViewMode } from '@/stores/uiStore'

interface ViewOption {
  id: TaskViewMode
  label: string
  icon: React.ReactNode
  description: string
}

const VIEW_OPTIONS: ViewOption[] = [
  {
    id: 'kanban',
    label: 'Kanban',
    icon: <LayoutGrid size={16} />,
    description: 'Board view with columns',
  },
  {
    id: 'list',
    label: 'List',
    icon: <List size={16} />,
    description: 'Traditional list view',
  },
  {
    id: 'agent-tasks',
    label: 'Agent Tasks',
    icon: <Bot size={16} />,
    description: 'Grouped by agent',
  },
  {
    id: 'graph',
    label: 'Dependencies',
    icon: <GitBranch size={16} />,
    description: 'Network graph of task dependencies',
  },
  {
    id: 'gantt',
    label: 'Gantt',
    icon: <GanttChart size={16} />,
    description: 'Timeline view with dependencies',
  },
  {
    id: 'calendar',
    label: 'Calendar',
    icon: <Calendar size={16} />,
    description: 'Tasks by due date',
  },
  {
    id: 'queue',
    label: 'Agent Queue',
    icon: <Zap size={16} />,
    description: 'Ready tasks for agent execution',
  },
  {
    id: 'orchestrator',
    label: 'Orchestrator',
    icon: <Workflow size={16} />,
    description: 'Active orchestrations & task trees',
  },
]

interface ViewSwitcherProps {
  currentView: TaskViewMode
  onViewChange: (view: TaskViewMode) => void
}

export function ViewSwitcher({ currentView, onViewChange }: ViewSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const currentOption = VIEW_OPTIONS.find((opt) => opt.id === currentView) || VIEW_OPTIONS[0]

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close on escape
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 hover:bg-surface-50 dark:hover:bg-surface-700 text-sm font-medium text-surface-700 dark:text-surface-300 transition-colors"
      >
        {currentOption.icon}
        <span>{currentOption.label}</span>
        <ChevronDown
          size={14}
          className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-56 py-1 rounded-lg border border-surface-200 dark:border-surface-600 bg-white dark:bg-surface-800 shadow-lg z-50"
          >
            {VIEW_OPTIONS.map((option) => {
              const isSelected = option.id === currentView
              return (
                <button
                  key={option.id}
                  onClick={() => {
                    onViewChange(option.id)
                    setIsOpen(false)
                  }}
                  className={`flex items-center gap-3 w-full px-3 py-2 text-left hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors ${
                    isSelected ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                  }`}
                >
                  <span
                    className={`flex-shrink-0 ${
                      isSelected
                        ? 'text-primary-600 dark:text-primary-400'
                        : 'text-surface-500 dark:text-surface-400'
                    }`}
                  >
                    {option.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-sm font-medium ${
                        isSelected
                          ? 'text-primary-600 dark:text-primary-400'
                          : 'text-surface-900 dark:text-surface-100'
                      }`}
                    >
                      {option.label}
                    </div>
                    <div className="text-xs text-surface-500 dark:text-surface-400">
                      {option.description}
                    </div>
                  </div>
                  {isSelected && (
                    <Check size={16} className="flex-shrink-0 text-primary-600 dark:text-primary-400" />
                  )}
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default ViewSwitcher
