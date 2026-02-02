// Task Detail — Compact orchestrator: header, 2 tabs (Activity/Details), action bar

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  X,
  Bot,
  User,
  Calendar,
  Clock,
  Sparkles,
  FileText,
  Check,
  ChevronDown,
  Activity,
} from 'lucide-react'
import type { Task, TaskStatus, AgentPersona, Skill } from '@/types/agentpm'
import type { ExecutionPlan } from '@/services/planner/dynamicPlanner'
import { TaskStatusBadge } from './TaskStatusBadge'
import { TaskPriorityBadge } from './TaskPriorityBadge'
import { TaskDependencies } from './TaskDependencies'
import { TaskAttachmentsSection } from './TaskAttachmentsSection'
import { TaskActivityFeed } from './TaskActivityFeed'
import { TaskActionBar } from './TaskActionBar'
import { useTimezoneFunctions } from '@/lib/timezone'

interface TaskDetailProps {
  task: Task
  agent?: AgentPersona
  skill?: Skill
  allTasks?: Task[]
  accountId?: string
  userId?: string
  agents?: AgentPersona[]
  onClose?: () => void
  onUpdateStatus?: (taskId: string, status: TaskStatus, note?: string) => void
  onDelete?: (taskId: string) => void
  onEdit?: (taskId: string) => void
  onDependencyChange?: () => void
  onApprovePlan?: (taskId: string, plan: ExecutionPlan) => void
}

type TabType = 'activity' | 'details'

export function TaskDetail({
  task,
  agent,
  skill,
  allTasks = [],
  accountId,
  userId,
  agents = [],
  onClose,
  onUpdateStatus,
  onDelete,
  onEdit,
  onDependencyChange,
  onApprovePlan,
}: TaskDetailProps) {
  const [activeTab, setActiveTab] = useState<TabType>('activity')
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const statusMenuRef = useRef<HTMLDivElement>(null)
  const { formatDate } = useTimezoneFunctions()

  // Reset to activity tab when switching tasks
  useEffect(() => {
    setActiveTab('activity')
  }, [task.id])

  // Close status menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) {
        setShowStatusMenu(false)
      }
    }
    if (showStatusMenu) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showStatusMenu])

  const formatDateDisplay = (dateStr?: string) => {
    if (!dateStr) return '-'
    return formatDate(dateStr, 'medium')
  }

  // Detect if ExecutionPanel should be active (agent task with credentials)
  const isExecuting = useExecutionActive(task)

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="flex flex-col h-full bg-white dark:bg-surface-800 border-l border-surface-200 dark:border-surface-700"
    >
      {/* ── Compact Header ── */}
      <div className="flex-shrink-0 px-4 pt-3 pb-2 border-b border-surface-200 dark:border-surface-700">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <h3 className="text-base font-semibold text-surface-900 dark:text-surface-100 leading-tight line-clamp-2 flex-1 min-w-0">
            {task.title}
          </h3>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-1.5 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-400 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Status + Priority + Agent row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status dropdown */}
          <div className="relative" ref={statusMenuRef}>
            <button
              onClick={() => setShowStatusMenu(!showStatusMenu)}
              className="inline-flex items-center gap-0.5 cursor-pointer hover:ring-1 hover:ring-primary-400/50 rounded-full transition-all"
            >
              <TaskStatusBadge status={task.status} size="sm" />
              <ChevronDown size={12} className="text-surface-400 -ml-0.5 mr-0.5" />
            </button>
            {showStatusMenu && (
              <div className="absolute left-0 top-full mt-1 z-50 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-600 rounded-lg shadow-lg py-1 min-w-[140px]">
                {(['draft', 'pending', 'queued', 'in_progress', 'review', 'completed', 'cancelled'] as TaskStatus[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      if (s !== task.status && onUpdateStatus) {
                        onUpdateStatus(task.id, s)
                      }
                      setShowStatusMenu(false)
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors ${
                      s === task.status ? 'font-semibold' : ''
                    }`}
                  >
                    <TaskStatusBadge status={s} size="sm" />
                    {s === task.status && <Check size={12} className="ml-auto text-primary-500" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <TaskPriorityBadge priority={task.priority} size="sm" />

          {task.assignedTo && agent && (
            <span className="flex items-center gap-1 text-xs text-surface-500 dark:text-surface-400 bg-surface-100 dark:bg-surface-700/50 px-2 py-0.5 rounded-full">
              {task.assignedToType === 'agent' ? <Bot size={11} className="text-primary-500" /> : <User size={11} />}
              {agent.alias}
            </span>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex-shrink-0 flex border-b border-surface-200 dark:border-surface-700">
        <button
          onClick={() => setActiveTab('activity')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors relative
            ${activeTab === 'activity'
              ? 'text-primary-600 dark:text-primary-400'
              : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
            }`}
        >
          <Activity size={16} />
          Activity
          {activeTab === 'activity' && (
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
      </div>

      {/* ── Tab Content ── */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'activity' && (
          <TaskActivityFeed
            task={task}
            agent={agent}
            skill={skill}
            agents={agents}
            accountId={accountId}
            userId={userId}
            onApprovePlan={onApprovePlan}
            onUpdateStatus={onUpdateStatus}
          />
        )}

        {activeTab === 'details' && (
          <div className="space-y-5">
            {/* Description */}
            {task.description && (
              <div>
                <h4 className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-2">
                  Description
                </h4>
                <p className="text-sm text-surface-700 dark:text-surface-300 leading-relaxed">
                  {task.description}
                </p>
              </div>
            )}

            {/* Metadata grid */}
            <div className="grid grid-cols-2 gap-4">
              {/* Assigned To */}
              <div>
                <h4 className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-1.5">
                  Assigned To
                </h4>
                {task.assignedTo && agent ? (
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                      {task.assignedToType === 'agent' ? (
                        <Bot size={14} className="text-primary-600 dark:text-primary-400" />
                      ) : (
                        <User size={14} className="text-primary-600 dark:text-primary-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-surface-900 dark:text-surface-100 truncate">{agent.alias}</p>
                      <p className="text-[10px] text-surface-500 dark:text-surface-400">
                        {task.assignedToType === 'agent' ? agent.agentType : 'User'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-surface-400">Unassigned</p>
                )}
              </div>

              {/* Skill */}
              <div>
                <h4 className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-1.5">
                  Skill
                </h4>
                {skill ? (
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                      <Sparkles size={14} className="text-purple-600 dark:text-purple-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-surface-900 dark:text-surface-100 truncate">{skill.name}</p>
                      <p className="text-[10px] text-surface-500 dark:text-surface-400 truncate">{skill.category}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-surface-400">None</p>
                )}
              </div>

              {/* Due Date */}
              <div>
                <h4 className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-1.5">
                  Due Date
                </h4>
                <div className="flex items-center gap-1.5 text-sm text-surface-700 dark:text-surface-300">
                  <Calendar size={14} className="text-surface-400" />
                  {formatDateDisplay(task.dueAt)}
                </div>
              </div>

              {/* Created */}
              <div>
                <h4 className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-1.5">
                  Created
                </h4>
                <div className="flex items-center gap-1.5 text-sm text-surface-700 dark:text-surface-300">
                  <Clock size={14} className="text-surface-400" />
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

            {/* Attachments */}
            {accountId && userId && (
              <TaskAttachmentsSection
                task={task}
                allTasks={allTasks}
                accountId={accountId}
                userId={userId}
              />
            )}
          </div>
        )}
      </div>

      {/* ── Action Bar (fixed bottom) ── */}
      <TaskActionBar
        task={task}
        isExecuting={isExecuting}
        onUpdateStatus={onUpdateStatus}
        onApprovePlan={onApprovePlan}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </motion.div>
  )
}

/** Lightweight hook: is any execution currently running for this task? */
function useExecutionActive(task: Task): boolean {
  return task.status === 'in_progress' || task.status === 'queued'
}
