// Forge Session Panel - Shows PRD execution progress and results

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  GitBranch,
  GitCommit,
  GitPullRequest,
  TestTube2,
  FileCode,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
  ExternalLink,
  Shield,
} from 'lucide-react'
import type { ForgeSession, ForgeExecutionStatus, ForgeTaskOutput } from '@/types/agentpm'

interface ForgeSessionPanelProps {
  session: ForgeSession
  onApprove?: () => void
  onReject?: (reason: string) => void
}

const STATUS_CONFIG: Record<ForgeExecutionStatus, {
  label: string
  icon: React.ElementType
  color: string
  bgColor: string
}> = {
  initializing: { label: 'Initializing', icon: Loader2, color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
  analyzing: { label: 'Analyzing PRD', icon: Loader2, color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
  implementing: { label: 'Implementing', icon: Loader2, color: 'text-purple-500', bgColor: 'bg-purple-500/10' },
  testing: { label: 'Running Tests', icon: TestTube2, color: 'text-yellow-500', bgColor: 'bg-yellow-500/10' },
  committing: { label: 'Committing', icon: GitCommit, color: 'text-cyan-500', bgColor: 'bg-cyan-500/10' },
  pushing: { label: 'Pushing', icon: GitBranch, color: 'text-cyan-500', bgColor: 'bg-cyan-500/10' },
  'creating-pr': { label: 'Creating PR', icon: GitPullRequest, color: 'text-green-500', bgColor: 'bg-green-500/10' },
  completed: { label: 'Completed', icon: CheckCircle2, color: 'text-green-500', bgColor: 'bg-green-500/10' },
  failed: { label: 'Failed', icon: XCircle, color: 'text-red-500', bgColor: 'bg-red-500/10' },
  'awaiting-approval': { label: 'Awaiting Approval', icon: Shield, color: 'text-orange-500', bgColor: 'bg-orange-500/10' },
}

export function ForgeSessionPanel({ session, onApprove, onReject }: ForgeSessionPanelProps) {
  const statusConfig = STATUS_CONFIG[session.status]
  const StatusIcon = statusConfig.icon
  const isInProgress = ['initializing', 'analyzing', 'implementing', 'testing', 'committing', 'pushing', 'creating-pr'].includes(session.status)
  const output = session.output as ForgeTaskOutput | undefined

  const executionTime = useMemo(() => {
    if (!session.startedAt) return null
    const start = new Date(session.startedAt)
    const end = session.completedAt ? new Date(session.completedAt) : new Date()
    const ms = end.getTime() - start.getTime()
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    }
    return `${seconds}s`
  }, [session.startedAt, session.completedAt])

  return (
    <div className="bg-surface-50 dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-700 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-surface-200 dark:border-surface-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg ${statusConfig.bgColor} flex items-center justify-center`}>
              <StatusIcon className={`${statusConfig.color} ${isInProgress ? 'animate-spin' : ''}`} size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-surface-900 dark:text-surface-100">
                Forge Execution
              </h3>
              <p className={`text-sm ${statusConfig.color}`}>
                {session.currentStep || statusConfig.label}
              </p>
            </div>
          </div>

          {executionTime && (
            <div className="flex items-center gap-1 text-sm text-surface-500">
              <Clock size={14} />
              {executionTime}
            </div>
          )}
        </div>

        {/* Progress Bar */}
        {isInProgress && session.progress !== undefined && (
          <div className="mt-3">
            <div className="h-2 bg-surface-200 dark:bg-surface-700 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${session.progress}%` }}
                transition={{ duration: 0.3 }}
                className="h-full bg-gradient-to-r from-orange-500 to-orange-400 rounded-full"
              />
            </div>
            <p className="text-xs text-surface-500 mt-1 text-right">{session.progress}%</p>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Branch Info */}
        {output?.branchName && (
          <div className="flex items-center gap-2 text-sm">
            <GitBranch size={16} className="text-cyan-500" />
            <span className="text-surface-500">Branch:</span>
            <code className="px-2 py-0.5 bg-surface-200 dark:bg-surface-800 rounded text-surface-700 dark:text-surface-300 font-mono text-xs">
              {output.branchName}
            </code>
          </div>
        )}

        {/* Commits */}
        {output?.commits && output.commits.length > 0 && (
          <div>
            <h4 className="flex items-center gap-2 text-sm font-medium text-surface-700 dark:text-surface-300 mb-2">
              <GitCommit size={14} />
              Commits ({output.commits.length})
            </h4>
            <div className="space-y-2">
              {output.commits.map((commit, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 p-2 rounded-lg bg-surface-100 dark:bg-surface-800"
                >
                  <code className="text-xs text-orange-500 font-mono">{commit.sha}</code>
                  <span className="text-sm text-surface-600 dark:text-surface-400 flex-1">
                    {commit.message}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Files Changed */}
        {output?.filesChanged && output.filesChanged.length > 0 && (
          <div>
            <h4 className="flex items-center gap-2 text-sm font-medium text-surface-700 dark:text-surface-300 mb-2">
              <FileCode size={14} />
              Files Changed ({output.filesChanged.length})
            </h4>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {output.filesChanged.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-xs font-mono"
                >
                  <span className={
                    file.changeType === 'added' ? 'text-green-500' :
                    file.changeType === 'deleted' ? 'text-red-500' :
                    file.changeType === 'renamed' ? 'text-yellow-500' :
                    'text-blue-500'
                  }>
                    {file.changeType === 'added' ? '+' :
                     file.changeType === 'deleted' ? '-' :
                     file.changeType === 'renamed' ? '→' : '~'}
                  </span>
                  <span className="text-surface-600 dark:text-surface-400 truncate flex-1">
                    {file.path}
                  </span>
                  <span className="text-green-500">+{file.additions}</span>
                  <span className="text-red-500">-{file.deletions}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Test Results */}
        {output?.testResults && (
          <div>
            <h4 className="flex items-center gap-2 text-sm font-medium text-surface-700 dark:text-surface-300 mb-2">
              <TestTube2 size={14} />
              Test Results
            </h4>
            <div className={`p-3 rounded-lg ${output.testResults.passed ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
              <div className="flex items-center gap-2">
                {output.testResults.passed ? (
                  <CheckCircle2 size={16} className="text-green-500" />
                ) : (
                  <XCircle size={16} className="text-red-500" />
                )}
                <span className={output.testResults.passed ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}>
                  {output.testResults.passedTests}/{output.testResults.totalTests} tests passed
                </span>
              </div>
              {output.testResults.failedTestNames && output.testResults.failedTestNames.length > 0 && (
                <div className="mt-2 text-xs text-red-600 dark:text-red-400 font-mono">
                  Failed: {output.testResults.failedTestNames.join(', ')}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pull Request */}
        {output?.pullRequest && (
          <div>
            <h4 className="flex items-center gap-2 text-sm font-medium text-surface-700 dark:text-surface-300 mb-2">
              <GitPullRequest size={14} />
              Pull Request
            </h4>
            <a
              href={output.pullRequest.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
            >
              <GitPullRequest size={16} className="text-green-500" />
              <span className="text-green-700 dark:text-green-400 flex-1">
                #{output.pullRequest.number} - {output.pullRequest.title}
              </span>
              <ExternalLink size={14} className="text-green-500" />
            </a>
          </div>
        )}

        {/* Error */}
        {session.error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle size={16} />
              <span className="font-medium">Error</span>
            </div>
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              {session.error}
            </p>
            {session.errorStep && (
              <p className="mt-1 text-xs text-red-500">
                Failed at: {session.errorStep}
              </p>
            )}
          </div>
        )}

        {/* Approval Actions */}
        {session.status === 'awaiting-approval' && (
          <div className="p-4 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
            <div className="flex items-center gap-2 mb-3">
              <Shield size={16} className="text-orange-500" />
              <span className="font-medium text-orange-700 dark:text-orange-400">
                Approval Required
              </span>
            </div>
            <p className="text-sm text-orange-600 dark:text-orange-300 mb-4">
              Forge wants to push changes and create a pull request. Review the changes above and approve or reject.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={onApprove}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition-colors"
              >
                <CheckCircle2 size={16} />
                Approve & Push
              </button>
              <button
                onClick={() => onReject?.('Rejected by user')}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-200 dark:bg-surface-700 hover:bg-surface-300 dark:hover:bg-surface-600 text-surface-700 dark:text-surface-300 font-medium transition-colors"
              >
                <XCircle size={16} />
                Reject
              </button>
            </div>
          </div>
        )}

        {/* Summary */}
        {session.status === 'completed' && output?.summary && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-sm">
            <CheckCircle2 size={16} />
            {output.summary}
          </div>
        )}

        {/* Cost & Tokens */}
        {output && (output.totalTokensUsed || output.totalCost) && (
          <div className="flex items-center gap-4 pt-3 border-t border-surface-200 dark:border-surface-700 text-xs text-surface-500">
            {output.totalTokensUsed && (
              <span>Tokens: {output.totalTokensUsed.toLocaleString()}</span>
            )}
            {output.totalCost && (
              <span>Cost: ${(output.totalCost / 100).toFixed(2)}</span>
            )}
            {output.executionTimeMs && (
              <span>Time: {Math.round(output.executionTimeMs / 1000)}s</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default ForgeSessionPanel
