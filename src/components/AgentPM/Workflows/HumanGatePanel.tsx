// Human Gate Panel — Approve/Select/Input UI for workflow gate steps
// Shown inline in TaskActivityFeed when a task has input.workflowGate

import { useState } from 'react'
import {
  CheckCircle2,
  XCircle,
  Send,
  Loader2,
} from 'lucide-react'
import { handleGateResponse } from '@/services/workflows'
import type { WorkflowGateConfig, WorkflowGateResponse } from '@/types/agentpm'

interface HumanGatePanelProps {
  taskId: string
  runId: string
  stepId: string
  gate: WorkflowGateConfig
  userId: string
  onResponded?: () => void
}

export function HumanGatePanel({
  taskId,
  runId,
  stepId,
  gate,
  userId,
  onResponded,
}: HumanGatePanelProps) {
  const [responding, setResponding] = useState(false)
  const [selectedOptions, setSelectedOptions] = useState<string[]>([])
  const [inputText, setInputText] = useState('')

  const handleSubmit = async (action: WorkflowGateResponse['action']) => {
    setResponding(true)
    try {
      const response: WorkflowGateResponse = {
        action,
        respondedBy: userId,
        respondedAt: new Date().toISOString(),
      }

      if (action === 'select') {
        response.selectedOptions = selectedOptions
      }
      if (action === 'input') {
        response.inputText = inputText
      }

      await handleGateResponse(runId, stepId, taskId, response)
      onResponded?.()
    } catch (err) {
      console.error('[HumanGatePanel] Error:', err)
    } finally {
      setResponding(false)
    }
  }

  const toggleOption = (option: string) => {
    setSelectedOptions((prev) =>
      prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option],
    )
  }

  return (
    <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 space-y-3">
      {/* Prompt */}
      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
        {gate.prompt || 'Action required'}
      </p>

      {/* Approve/Reject */}
      {gate.type === 'approve' && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleSubmit('approve')}
            disabled={responding}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-medium transition-colors"
          >
            {responding ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <CheckCircle2 size={14} />
            )}
            Approve
          </button>
          <button
            onClick={() => handleSubmit('reject')}
            disabled={responding}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-surface-200 dark:bg-surface-700 hover:bg-surface-300 dark:hover:bg-surface-600 text-surface-700 dark:text-surface-300 text-sm font-medium transition-colors"
          >
            <XCircle size={14} />
            Reject
          </button>
        </div>
      )}

      {/* Select Options */}
      {gate.type === 'select' && (
        <>
          <div className="space-y-1.5">
            {(gate.options || []).map((option, i) => (
              <label
                key={i}
                className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                  selectedOptions.includes(option)
                    ? 'border-amber-400 dark:border-amber-600 bg-amber-100 dark:bg-amber-900/20'
                    : 'border-amber-200 dark:border-amber-800 hover:bg-amber-100/50 dark:hover:bg-amber-900/10'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedOptions.includes(option)}
                  onChange={() => toggleOption(option)}
                  className="rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                />
                <span className="text-sm text-surface-800 dark:text-surface-200">{option}</span>
              </label>
            ))}
          </div>
          <button
            onClick={() => handleSubmit('select')}
            disabled={responding || selectedOptions.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-sm font-medium transition-colors"
          >
            {responding ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
            Confirm Selection ({selectedOptions.length})
          </button>
        </>
      )}

      {/* Free Text Input */}
      {gate.type === 'input' && (
        <>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Enter your response..."
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-white dark:bg-surface-900 text-sm text-surface-900 dark:text-surface-100 outline-none resize-none focus:ring-2 focus:ring-amber-500"
          />
          <button
            onClick={() => handleSubmit('input')}
            disabled={responding || !inputText.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-sm font-medium transition-colors"
          >
            {responding ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
            Submit
          </button>
        </>
      )}
    </div>
  )
}
