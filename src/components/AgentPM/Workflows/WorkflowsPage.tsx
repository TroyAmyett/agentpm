// Workflows Page — Template list + active runs

import { useState, useEffect } from 'react'
import {
  Plus,
  Play,
  Clock,
  Workflow,
  MoreHorizontal,
  Trash2,
  Edit3,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Pause,
  XCircle,
} from 'lucide-react'
import { useWorkflowStore } from '@/stores/workflowStore'
import { startWorkflowRun } from '@/services/workflows'
import type { AgentPersona, WorkflowTemplate, WorkflowRun, WorkflowRunStatus } from '@/types/agentpm'
import { WorkflowTemplateBuilder } from './WorkflowTemplateBuilder'
import { WorkflowRunViewer } from './WorkflowRunViewer'

interface WorkflowsPageProps {
  accountId: string
  userId: string
  agents: AgentPersona[]
}

export function WorkflowsPage({ accountId, userId, agents }: WorkflowsPageProps) {
  const { templates, runs, loading, fetchTemplates, fetchRuns, deleteTemplate } = useWorkflowStore()
  const [view, setView] = useState<'list' | 'builder' | 'run-viewer'>('list')
  const [editingTemplate, setEditingTemplate] = useState<WorkflowTemplate | null>(null)
  const [viewingRun, setViewingRun] = useState<WorkflowRun | null>(null)
  const [startingRun, setStartingRun] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)

  useEffect(() => {
    if (accountId) {
      fetchTemplates(accountId)
      fetchRuns(accountId)
    }
  }, [accountId, fetchTemplates, fetchRuns])

  const handleStartRun = async (templateId: string) => {
    setStartingRun(templateId)
    try {
      await startWorkflowRun(templateId, accountId, userId, 'user')
      await fetchRuns(accountId)
    } catch (err) {
      console.error('Failed to start workflow run:', err)
    } finally {
      setStartingRun(null)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this workflow template?')) return
    await deleteTemplate(id)
    setMenuOpen(null)
  }

  const handleEdit = (template: WorkflowTemplate) => {
    setEditingTemplate(template)
    setView('builder')
    setMenuOpen(null)
  }

  const handleBuilderClose = () => {
    setView('list')
    setEditingTemplate(null)
    fetchTemplates(accountId)
  }

  const activeRuns = runs.filter((r) => r.status === 'running' || r.status === 'paused')
  const recentRuns = runs.filter((r) => r.status !== 'running' && r.status !== 'paused').slice(0, 10)

  if (view === 'builder') {
    return (
      <WorkflowTemplateBuilder
        accountId={accountId}
        userId={userId}
        agents={agents}
        template={editingTemplate}
        onClose={handleBuilderClose}
      />
    )
  }

  if (view === 'run-viewer' && viewingRun) {
    return (
      <WorkflowRunViewer
        run={viewingRun}
        onClose={() => {
          setView('list')
          setViewingRun(null)
        }}
      />
    )
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Workflow size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-surface-900 dark:text-surface-100">Workflows</h2>
              <p className="text-sm text-surface-500 dark:text-surface-400">
                Reusable multi-step processes with scheduling
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setEditingTemplate(null)
              setView('builder')
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            New Workflow
          </button>
        </div>

        {/* Templates */}
        <section>
          <h3 className="text-sm font-semibold text-surface-600 dark:text-surface-400 uppercase tracking-wider mb-3">
            Templates
          </h3>
          {loading && templates.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-surface-400">
              <Loader2 size={20} className="animate-spin mr-2" />
              Loading workflows...
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-surface-200 dark:border-surface-700 rounded-xl">
              <Workflow size={36} className="mx-auto mb-3 text-surface-300 dark:text-surface-600" />
              <p className="text-sm text-surface-500 dark:text-surface-400 mb-3">No workflows yet</p>
              <button
                onClick={() => {
                  setEditingTemplate(null)
                  setView('builder')
                }}
                className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
              >
                Create your first workflow
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  isStarting={startingRun === template.id}
                  menuOpen={menuOpen === template.id}
                  onStart={() => handleStartRun(template.id)}
                  onEdit={() => handleEdit(template)}
                  onDelete={() => handleDelete(template.id)}
                  onToggleMenu={() => setMenuOpen(menuOpen === template.id ? null : template.id)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Active Runs */}
        {activeRuns.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-surface-600 dark:text-surface-400 uppercase tracking-wider mb-3">
              Active Runs
            </h3>
            <div className="space-y-3">
              {activeRuns.map((run) => (
                <RunCard
                  key={run.id}
                  run={run}
                  onClick={() => {
                    setViewingRun(run)
                    setView('run-viewer')
                  }}
                />
              ))}
            </div>
          </section>
        )}

        {/* Recent Runs */}
        {recentRuns.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-surface-600 dark:text-surface-400 uppercase tracking-wider mb-3">
              Recent Runs
            </h3>
            <div className="space-y-2">
              {recentRuns.map((run) => (
                <RunCard
                  key={run.id}
                  run={run}
                  compact
                  onClick={() => {
                    setViewingRun(run)
                    setView('run-viewer')
                  }}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

// ─── Template Card ──────────────────────────────────────────────────────────

function TemplateCard({
  template,
  isStarting,
  menuOpen,
  onStart,
  onEdit,
  onDelete,
  onToggleMenu,
}: {
  template: WorkflowTemplate
  isStarting: boolean
  menuOpen: boolean
  onStart: () => void
  onEdit: () => void
  onDelete: () => void
  onToggleMenu: () => void
}) {
  const stepCount = template.steps.length
  const hasSchedule = template.isScheduleActive && template.schedule && template.schedule.type !== 'none'

  return (
    <div className="flex items-center gap-4 p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:border-surface-300 dark:hover:border-surface-600 transition-colors">
      {/* Icon */}
      <div className="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
        <span className="text-lg">{template.icon || '⚡'}</span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-semibold text-surface-900 dark:text-surface-100 truncate">
          {template.name}
        </h4>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-xs text-surface-500 dark:text-surface-400">
            {stepCount} step{stepCount !== 1 ? 's' : ''}
          </span>
          {hasSchedule && (
            <span className="flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400">
              <Clock size={11} />
              {formatSchedule(template.schedule!)}
            </span>
          )}
          {template.lastRunAt && (
            <span className="text-xs text-surface-400 dark:text-surface-500">
              Last run: {formatRelativeDate(template.lastRunAt)}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={onStart}
          disabled={isStarting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400 text-white text-xs font-medium transition-colors"
        >
          {isStarting ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Play size={12} />
          )}
          Run Now
        </button>

        <div className="relative">
          <button
            onClick={onToggleMenu}
            className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-400 transition-colors"
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-600 rounded-lg shadow-lg py-1 min-w-[120px]">
              <button
                onClick={onEdit}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700"
              >
                <Edit3 size={12} />
                Edit
              </button>
              <button
                onClick={onDelete}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <Trash2 size={12} />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Run Card ───────────────────────────────────────────────────────────────

function RunCard({
  run,
  compact,
  onClick,
}: {
  run: WorkflowRun
  compact?: boolean
  onClick: () => void
}) {
  const steps = run.stepsSnapshot
  const totalSteps = steps.length
  const currentStep = run.currentStepIndex
  const currentStepDef = steps[currentStep]
  const isWaitingGate = currentStepDef?.type === 'human_gate' && run.status === 'running'

  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border transition-colors ${
        compact
          ? 'border-surface-100 dark:border-surface-800 hover:border-surface-200 dark:hover:border-surface-700'
          : 'border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:border-surface-300 dark:hover:border-surface-600'
      }`}
    >
      {/* Status icon */}
      <RunStatusIcon status={run.status} isWaitingGate={isWaitingGate} />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-surface-900 dark:text-surface-100 truncate">
          {run.template?.name || 'Workflow'} — {new Date(run.startedAt).toLocaleDateString()}
        </p>
        <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
          {run.status === 'running' && currentStepDef
            ? `Step ${currentStep + 1}/${totalSteps}: ${currentStepDef.title}${isWaitingGate ? ' (waiting for input)' : ''}`
            : run.status === 'completed'
              ? `Completed ${totalSteps} steps`
              : run.status === 'failed'
                ? 'Failed'
                : run.status === 'cancelled'
                  ? 'Cancelled'
                  : run.status
          }
        </p>
      </div>

      {/* Progress bar for active runs */}
      {!compact && run.status === 'running' && (
        <div className="w-16 h-1.5 rounded-full bg-surface-200 dark:bg-surface-700 flex-shrink-0 overflow-hidden">
          <div
            className="h-full rounded-full bg-violet-500 transition-all"
            style={{ width: `${Math.max(5, (currentStep / totalSteps) * 100)}%` }}
          />
        </div>
      )}
    </button>
  )
}

function RunStatusIcon({ status, isWaitingGate }: { status: WorkflowRunStatus; isWaitingGate?: boolean }) {
  if (isWaitingGate) {
    return (
      <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
        <Pause size={14} className="text-amber-600 dark:text-amber-400" />
      </div>
    )
  }

  switch (status) {
    case 'running':
      return (
        <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
          <Loader2 size={14} className="text-violet-600 dark:text-violet-400 animate-spin" />
        </div>
      )
    case 'completed':
      return (
        <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
          <CheckCircle2 size={14} className="text-green-600 dark:text-green-400" />
        </div>
      )
    case 'failed':
      return (
        <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
          <AlertCircle size={14} className="text-red-600 dark:text-red-400" />
        </div>
      )
    case 'cancelled':
      return (
        <div className="w-8 h-8 rounded-lg bg-surface-100 dark:bg-surface-800 flex items-center justify-center flex-shrink-0">
          <XCircle size={14} className="text-surface-400" />
        </div>
      )
    default:
      return (
        <div className="w-8 h-8 rounded-lg bg-surface-100 dark:bg-surface-800 flex items-center justify-center flex-shrink-0">
          <Workflow size={14} className="text-surface-400" />
        </div>
      )
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatSchedule(schedule: { type: string; hour?: number; dayOfWeek?: number; dayOfMonth?: number }): string {
  const hour = schedule.hour ?? 0
  const hourStr = `${hour % 12 || 12}${hour < 12 ? 'am' : 'pm'}`
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  switch (schedule.type) {
    case 'daily': return `Daily ${hourStr}`
    case 'weekly': return `${days[schedule.dayOfWeek ?? 0]} ${hourStr}`
    case 'monthly': return `${ordinal(schedule.dayOfMonth ?? 1)} ${hourStr}`
    case 'once': return `Once`
    default: return ''
  }
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}
