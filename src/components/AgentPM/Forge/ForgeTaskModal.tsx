// Forge Task Modal - Create tasks for PRD execution with Forge agent

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Hammer,
  GitBranch,
  FolderGit2,
  FileText,
  TestTube2,
  GitPullRequest,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import type { TaskPriority, AgentPersona, ForgeTaskInput } from '@/types/agentpm'

interface ForgeTaskModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (task: {
    title: string
    description?: string
    priority: TaskPriority
    assignedTo: string
    assignedToType: 'agent'
    projectId?: string
    input: ForgeTaskInput
  }) => Promise<void>
  agents: AgentPersona[]
  projectId?: string
  defaultPrdContent?: string
  defaultPrdNoteId?: string
}

export function ForgeTaskModal({
  isOpen,
  onClose,
  onSubmit,
  agents,
  projectId,
  defaultPrdContent = '',
  defaultPrdNoteId,
}: ForgeTaskModalProps) {
  // Basic task fields
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('medium')

  // Forge-specific fields
  const [prdContent, setPrdContent] = useState(defaultPrdContent)
  const [repositoryPath, setRepositoryPath] = useState('')
  const [repositoryUrl, setRepositoryUrl] = useState('')
  const [baseBranch, setBaseBranch] = useState('main')
  const [targetBranch, setTargetBranch] = useState('')
  const [runTests, setRunTests] = useState(true)
  const [createPullRequest, setCreatePullRequest] = useState(true)
  const [autoCommit, setAutoCommit] = useState(true)
  const [testCommand, setTestCommand] = useState('')

  // UI state
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Find Forge agent
  const forgeAgent = useMemo(
    () => agents.find((a) => a.agentType === 'forge' && a.isActive && !a.pausedAt),
    [agents]
  )

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      if (defaultPrdContent) {
        setPrdContent(defaultPrdContent)
        // Try to extract title from PRD
        const firstLine = defaultPrdContent.split('\n')[0].replace(/^#*\s*/, '').trim()
        if (firstLine) {
          setTitle(firstLine.slice(0, 100))
        }
      }
    }
  }, [isOpen, defaultPrdContent])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!title.trim()) {
      setError('Title is required')
      return
    }
    if (!prdContent.trim()) {
      setError('PRD content is required')
      return
    }
    if (!repositoryPath.trim()) {
      setError('Repository path is required')
      return
    }
    if (!forgeAgent) {
      setError('No active Forge agent found. Please create or activate a Forge agent first.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const input: ForgeTaskInput = {
        prdContent: prdContent.trim(),
        prdNoteId: defaultPrdNoteId,
        repositoryPath: repositoryPath.trim(),
        repositoryUrl: repositoryUrl.trim() || undefined,
        baseBranch: baseBranch.trim() || 'main',
        targetBranch: targetBranch.trim() || undefined,
        runTests,
        createPullRequest,
        autoCommit,
        testCommand: testCommand.trim() || undefined,
      }

      await onSubmit({
        title: title.trim(),
        description: `PRD Execution: ${title.trim()}`,
        priority,
        assignedTo: forgeAgent.id,
        assignedToType: 'agent',
        projectId,
        input,
      })

      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    setTitle('')
    setPrdContent('')
    setRepositoryPath('')
    setRepositoryUrl('')
    setBaseBranch('main')
    setTargetBranch('')
    setRunTests(true)
    setCreatePullRequest(true)
    setAutoCommit(true)
    setTestCommand('')
    setShowAdvanced(false)
    setError(null)
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/50 z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-surface-800 rounded-xl shadow-xl z-50"
          >
            {/* Header */}
            <div className="sticky top-0 flex items-center justify-between p-4 border-b border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                  <Hammer className="text-orange-500" size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
                    Create Forge Task
                  </h2>
                  <p className="text-sm text-surface-500">
                    Execute a PRD with the Forge developer agent
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-500 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
                  <AlertTriangle size={16} />
                  {error}
                </div>
              )}

              {/* No Forge Agent Warning */}
              {!forgeAgent && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400 text-sm">
                  <AlertTriangle size={16} />
                  No active Forge agent found. Create a Forge agent in the Agents tab first.
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                  Task Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Implement user authentication"
                  className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  autoFocus
                />
              </div>

              {/* PRD Content */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                  <FileText size={16} />
                  PRD Content <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={prdContent}
                  onChange={(e) => setPrdContent(e.target.value)}
                  placeholder="Paste your Product Requirements Document here...

Example:
# Feature: User Authentication

## Overview
Implement a secure user authentication system...

## Requirements
1. Users can sign up with email and password
2. Users can log in with existing credentials
..."
                  rows={8}
                  className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none font-mono text-sm"
                />
              </div>

              {/* Repository Settings */}
              <div className="p-4 rounded-lg bg-surface-50 dark:bg-surface-900 space-y-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-surface-700 dark:text-surface-300">
                  <FolderGit2 size={16} />
                  Repository Settings
                </h3>

                {/* Repository Path */}
                <div>
                  <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                    Local Repository Path <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={repositoryPath}
                    onChange={(e) => setRepositoryPath(e.target.value)}
                    placeholder="e.g., C:\dev\my-project or /home/user/my-project"
                    className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
                  />
                </div>

                {/* Repository URL */}
                <div>
                  <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                    Repository URL (optional)
                  </label>
                  <input
                    type="text"
                    value={repositoryUrl}
                    onChange={(e) => setRepositoryUrl(e.target.value)}
                    placeholder="e.g., https://github.com/username/repo"
                    className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
                  />
                </div>

                {/* Branch Settings */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                      <GitBranch size={14} />
                      Base Branch
                    </label>
                    <input
                      type="text"
                      value={baseBranch}
                      onChange={(e) => setBaseBranch(e.target.value)}
                      placeholder="main"
                      className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                      <GitBranch size={14} />
                      Target Branch (optional)
                    </label>
                    <input
                      type="text"
                      value={targetBranch}
                      onChange={(e) => setTargetBranch(e.target.value)}
                      placeholder="Auto-generated if empty"
                      className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Execution Options */}
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={runTests}
                    onChange={(e) => setRunTests(e.target.checked)}
                    className="w-4 h-4 rounded border-surface-300 dark:border-surface-600 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="flex items-center gap-1 text-sm text-surface-700 dark:text-surface-300">
                    <TestTube2 size={14} />
                    Run Tests
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoCommit}
                    onChange={(e) => setAutoCommit(e.target.checked)}
                    className="w-4 h-4 rounded border-surface-300 dark:border-surface-600 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="flex items-center gap-1 text-sm text-surface-700 dark:text-surface-300">
                    <GitBranch size={14} />
                    Auto Commit
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createPullRequest}
                    onChange={(e) => setCreatePullRequest(e.target.checked)}
                    className="w-4 h-4 rounded border-surface-300 dark:border-surface-600 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="flex items-center gap-1 text-sm text-surface-700 dark:text-surface-300">
                    <GitPullRequest size={14} />
                    Create PR
                  </span>
                </label>
              </div>

              {/* Advanced Options */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-2 text-sm text-surface-500 hover:text-surface-700 dark:hover:text-surface-300"
                >
                  {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  Advanced Options
                </button>

                {showAdvanced && (
                  <div className="mt-3 p-4 rounded-lg bg-surface-50 dark:bg-surface-900 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                        Test Command (optional)
                      </label>
                      <input
                        type="text"
                        value={testCommand}
                        onChange={(e) => setTestCommand(e.target.value)}
                        placeholder="e.g., npm test, pytest, go test ./..."
                        className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                        Priority
                      </label>
                      <select
                        value={priority}
                        onChange={(e) => setPriority(e.target.value as TaskPriority)}
                        className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="critical">Critical</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-surface-200 dark:border-surface-700">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !title.trim() || !prdContent.trim() || !repositoryPath.trim() || !forgeAgent}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Hammer size={16} />
                  {isSubmitting ? 'Creating...' : 'Create Forge Task'}
                </button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export default ForgeTaskModal
