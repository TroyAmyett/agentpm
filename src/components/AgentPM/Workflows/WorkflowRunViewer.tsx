// Workflow Run Viewer — Shows step-by-step progress of a workflow run

import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  Pause,
  Bot,
  UserCheck,
  FileOutput,
} from 'lucide-react'
import type { WorkflowRun, WorkflowStepDef, WorkflowStepResult, WorkflowStepType } from '@/types/agentpm'

interface WorkflowRunViewerProps {
  run: WorkflowRun
  onClose: () => void
}

const STEP_TYPE_LABELS: Record<WorkflowStepType, string> = {
  agent_task: 'Agent Task',
  human_gate: 'Human Gate',
  document_output: 'Document',
}

const STEP_TYPE_ICONS: Record<WorkflowStepType, React.ReactNode> = {
  agent_task: <Bot size={14} />,
  human_gate: <UserCheck size={14} />,
  document_output: <FileOutput size={14} />,
}

export function WorkflowRunViewer({ run, onClose }: WorkflowRunViewerProps) {
  const steps = run.stepsSnapshot
  const stepResults = run.stepResults || {}

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={onClose}
            className="flex items-center gap-2 text-sm text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 transition-colors"
          >
            <ArrowLeft size={16} />
            Back to Workflows
          </button>
          <RunStatusBadge status={run.status} />
        </div>

        {/* Title */}
        <div>
          <h2 className="text-xl font-bold text-surface-900 dark:text-surface-100">
            {run.template?.name || 'Workflow'} — {new Date(run.startedAt).toLocaleDateString()}
          </h2>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
            Started {new Date(run.startedAt).toLocaleString()} &middot; Triggered by {run.triggeredBy}
          </p>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-surface-500">
            <span>Progress</span>
            <span>{completedCount(steps, stepResults)} / {steps.length} steps</span>
          </div>
          <div className="w-full h-2 rounded-full bg-surface-200 dark:bg-surface-700 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                run.status === 'failed' ? 'bg-red-500' :
                run.status === 'completed' ? 'bg-green-500' : 'bg-violet-500'
              }`}
              style={{ width: `${(completedCount(steps, stepResults) / steps.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Steps Timeline */}
        <div className="relative space-y-0">
          {/* Timeline connector */}
          <div className="absolute left-[19px] top-6 bottom-6 w-0.5 bg-surface-200 dark:bg-surface-700" />

          {steps.map((step, index) => {
            const result = stepResults[step.id]
            const isCurrent = index === run.currentStepIndex && run.status === 'running'

            return (
              <StepCard
                key={step.id}
                step={step}
                index={index}
                result={result}
                isCurrent={isCurrent}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Step Card ──────────────────────────────────────────────────────────────

function StepCard({
  step,
  index,
  result,
  isCurrent,
}: {
  step: WorkflowStepDef
  index: number
  result?: WorkflowStepResult
  isCurrent: boolean
}) {
  const status = result?.status || (isCurrent ? 'running' : 'pending')

  return (
    <div className={`relative flex gap-3 py-3 ${isCurrent ? 'bg-violet-50/50 dark:bg-violet-900/5 -mx-3 px-3 rounded-lg' : ''}`}>
      {/* Status icon */}
      <div className="relative z-10 flex-shrink-0">
        <StepStatusIcon status={status} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-medium text-surface-400">Step {index + 1}</span>
          <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
            step.type === 'agent_task' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' :
            step.type === 'human_gate' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' :
            'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
          }`}>
            {STEP_TYPE_ICONS[step.type]}
            {STEP_TYPE_LABELS[step.type]}
          </span>
        </div>

        <p className="text-sm font-medium text-surface-900 dark:text-surface-100">
          {step.title}
        </p>

        {step.description && (
          <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5 line-clamp-2">
            {step.description}
          </p>
        )}

        {/* Gate response */}
        {result?.gateResponse && (
          <div className="mt-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">
              Response: {result.gateResponse.action}
            </p>
            {result.gateResponse.selectedOptions && result.gateResponse.selectedOptions.length > 0 && (
              <ul className="text-xs text-amber-600 dark:text-amber-400 space-y-0.5">
                {result.gateResponse.selectedOptions.map((opt, i) => (
                  <li key={i} className="flex items-center gap-1">
                    <CheckCircle2 size={10} />
                    {opt}
                  </li>
                ))}
              </ul>
            )}
            {result.gateResponse.inputText && (
              <p className="text-xs text-amber-600 dark:text-amber-400 italic">
                "{result.gateResponse.inputText}"
              </p>
            )}
          </div>
        )}

        {/* Timing */}
        {result?.completedAt && (
          <p className="text-[10px] text-surface-400 mt-1">
            Completed {new Date(result.completedAt).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Status Components ──────────────────────────────────────────────────────

function StepStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return (
        <div className="w-[38px] h-[38px] rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
          <CheckCircle2 size={18} className="text-green-600 dark:text-green-400" />
        </div>
      )
    case 'running':
      return (
        <div className="w-[38px] h-[38px] rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center animate-pulse">
          <Loader2 size={18} className="text-violet-600 dark:text-violet-400 animate-spin" />
        </div>
      )
    case 'waiting_gate':
      return (
        <div className="w-[38px] h-[38px] rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <Pause size={18} className="text-amber-600 dark:text-amber-400" />
        </div>
      )
    case 'failed':
      return (
        <div className="w-[38px] h-[38px] rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
          <AlertCircle size={18} className="text-red-600 dark:text-red-400" />
        </div>
      )
    default:
      return (
        <div className="w-[38px] h-[38px] rounded-full bg-surface-100 dark:bg-surface-800 flex items-center justify-center">
          <Clock size={18} className="text-surface-400 dark:text-surface-600" />
        </div>
      )
  }
}

function RunStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300',
    paused: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
    completed: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    failed: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    cancelled: 'bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400',
  }

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium ${colors[status] || colors.cancelled}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function completedCount(
  steps: WorkflowStepDef[],
  results: Record<string, WorkflowStepResult>,
): number {
  return steps.filter((s) => results[s.id]?.status === 'completed').length
}
