// Execution Panel - Shows execution controls and output for a task

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Bot,
  Sparkles,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Zap,
} from 'lucide-react'
import type { Task, AgentPersona, Skill } from '@/types/agentpm'
import { useExecutionStore } from '@/stores/executionStore'
import { isExecutionConfigured } from '@/services/agents/executor'

interface ExecutionPanelProps {
  task: Task
  agent?: AgentPersona
  skill?: Skill
  accountId: string
  userId: string
}

export function ExecutionPanel({
  task,
  agent,
  skill,
  accountId,
  userId,
}: ExecutionPanelProps) {
  const {
    executions,
    currentExecution,
    isExecuting,
    executionStatus,
    error,
    fetchExecutions,
    runTask,
  } = useExecutionStore()

  const [showHistory, setShowHistory] = useState(false)
  const [copiedContent, setCopiedContent] = useState(false)

  // Fetch execution history for this task
  useEffect(() => {
    if (accountId && task.id) {
      fetchExecutions(accountId, task.id)
    }
  }, [accountId, task.id, fetchExecutions])

  const canRun = agent && !isExecuting && isExecutionConfigured()

  const handleRun = async () => {
    if (!agent) return
    await runTask(task, agent, skill, accountId, userId)
  }

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedContent(true)
    setTimeout(() => setCopiedContent(false), 2000)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 dark:text-green-400'
      case 'failed':
        return 'text-red-600 dark:text-red-400'
      case 'running':
        return 'text-yellow-600 dark:text-yellow-400'
      default:
        return 'text-surface-500'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 size={16} className="text-green-500" />
      case 'failed':
        return <XCircle size={16} className="text-red-500" />
      case 'running':
        return <Loader2 size={16} className="animate-spin text-yellow-500" />
      default:
        return <Clock size={16} className="text-surface-400" />
    }
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  // Get the latest execution to display
  const displayExecution = currentExecution?.taskId === task.id ? currentExecution : executions[0]

  return (
    <div className="space-y-4">
      {/* Run Button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleRun}
          disabled={!canRun}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors ${
            canRun
              ? 'bg-gradient-to-r from-primary-500 to-purple-500 hover:from-primary-600 hover:to-purple-600 text-white shadow-md'
              : 'bg-surface-200 dark:bg-surface-700 text-surface-400 cursor-not-allowed'
          }`}
        >
          {isExecuting ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              <span>
                {executionStatus === 'building_prompt' && 'Building prompt...'}
                {executionStatus === 'calling_api' && 'Calling Claude...'}
                {executionStatus === 'processing' && 'Processing...'}
                {executionStatus === 'idle' && 'Running...'}
              </span>
            </>
          ) : (
            <>
              <Zap size={18} />
              Run with {agent?.alias || 'Agent'}
            </>
          )}
        </button>

        {/* Context Pills */}
        <div className="flex items-center gap-2 text-xs">
          {agent && (
            <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300">
              <Bot size={12} />
              {agent.alias}
            </span>
          )}
          {skill && (
            <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
              <Sparkles size={12} />
              {skill.name}
            </span>
          )}
        </div>
      </div>

      {/* Warning if no agent */}
      {!agent && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          Assign an agent to this task to run it.
        </p>
      )}

      {/* API not configured warning */}
      {!isExecutionConfigured() && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          Configure your Anthropic API key to run tasks.
        </p>
      )}

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Current/Latest Execution Output */}
      <AnimatePresence mode="wait">
        {displayExecution && (
          <motion.div
            key={displayExecution.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-lg border border-surface-200 dark:border-surface-700 overflow-hidden"
          >
            {/* Execution Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-surface-50 dark:bg-surface-900/50">
              <div className="flex items-center gap-3">
                {getStatusIcon(displayExecution.status)}
                <span className={`font-medium ${getStatusColor(displayExecution.status)}`}>
                  {displayExecution.status.charAt(0).toUpperCase() + displayExecution.status.slice(1)}
                </span>
                {displayExecution.outputMetadata?.durationMs && (
                  <span className="text-xs text-surface-500">
                    {formatDuration(displayExecution.outputMetadata.durationMs)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-surface-500">
                {displayExecution.outputMetadata && (
                  <span>
                    {displayExecution.outputMetadata.inputTokens + displayExecution.outputMetadata.outputTokens} tokens
                  </span>
                )}
                <span>{formatDateTime(displayExecution.createdAt)}</span>
              </div>
            </div>

            {/* Output Content */}
            {displayExecution.outputContent && (
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-surface-500 uppercase tracking-wider">
                    Output
                  </span>
                  <button
                    onClick={() => copyToClipboard(displayExecution.outputContent || '')}
                    className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-surface-100 dark:hover:bg-surface-800"
                  >
                    {copiedContent ? (
                      <Check size={12} className="text-green-500" />
                    ) : (
                      <Copy size={12} />
                    )}
                    Copy
                  </button>
                </div>
                <div className="p-4 rounded-lg bg-surface-50 dark:bg-surface-900 max-h-96 overflow-auto">
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    {displayExecution.outputContent.split('\n').map((line, i) => {
                      const trimmedLine = line.trim()
                      if (!trimmedLine) return <br key={i} />
                      if (trimmedLine.startsWith('# ')) {
                        return <h1 key={i} className="text-xl font-bold mt-4 mb-2">{trimmedLine.replace('# ', '')}</h1>
                      }
                      if (trimmedLine.startsWith('## ')) {
                        return <h2 key={i} className="text-lg font-semibold mt-4 mb-2">{trimmedLine.replace('## ', '')}</h2>
                      }
                      if (trimmedLine.startsWith('### ')) {
                        return <h3 key={i} className="text-base font-semibold mt-3 mb-1">{trimmedLine.replace('### ', '')}</h3>
                      }
                      if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
                        return <li key={i} className="ml-4">{trimmedLine.replace(/^[-*] /, '')}</li>
                      }
                      if (trimmedLine.match(/^\d+\. /)) {
                        return <li key={i} className="ml-4 list-decimal">{trimmedLine.replace(/^\d+\. /, '')}</li>
                      }
                      return <p key={i} className="mb-2">{trimmedLine}</p>
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Error Message */}
            {displayExecution.errorMessage && (
              <div className="px-4 pb-4">
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-700 dark:text-red-300">
                    {displayExecution.errorMessage}
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Execution History */}
      {executions.length > 1 && (
        <div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center justify-between w-full text-left py-2"
          >
            <span className="text-xs font-medium text-surface-500 uppercase tracking-wider">
              Previous Executions ({executions.length - 1})
            </span>
            {showHistory ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          <AnimatePresence>
            {showHistory && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2 overflow-hidden"
              >
                {executions.slice(1).map((exec) => (
                  <div
                    key={exec.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-surface-50 dark:bg-surface-900/50"
                  >
                    <div className="flex items-center gap-2">
                      {getStatusIcon(exec.status)}
                      <span className={`text-sm ${getStatusColor(exec.status)}`}>
                        {exec.status}
                      </span>
                    </div>
                    <div className="text-xs text-surface-500">
                      {exec.outputMetadata?.durationMs && (
                        <span className="mr-3">
                          {formatDuration(exec.outputMetadata.durationMs)}
                        </span>
                      )}
                      {formatDateTime(exec.createdAt)}
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
