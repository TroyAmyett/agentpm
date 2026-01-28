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
import type { TaskPriority, AgentPersona, ForgeTaskInput, Project } from '@/types/agentpm'

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
  projects: Project[]
  projectId?: string
  defaultPrdContent?: string
  defaultPrdNoteId?: string
}

export function ForgeTaskModal({
  isOpen,
  onClose,
  onSubmit,
  agents,
  projects,
  projectId: defaultProjectId,
  defaultPrdContent = '',
  defaultPrdNoteId,
}: ForgeTaskModalProps) {
  // Basic task fields
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [selectedProjectId, setSelectedProjectId] = useState<string>(defaultProjectId || '')

  // Forge-specific fields
  const [prdContent, setPrdContent] = useState(defaultPrdContent)
  const [targetBranch, setTargetBranch] = useState('')
  const [runTests, setRunTests] = useState(true)
  const [createPullRequest, setCreatePullRequest] = useState(true)
  const [autoCommit, setAutoCommit] = useState(true)
  const [testCommand, setTestCommand] = useState('')

  // UI state
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Get selected project
  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId),
    [projects, selectedProjectId]
  )

  // Find Forge agent
  const forgeAgent = useMemo(
    () => agents.find((a) => a.agentType === 'forge' && a.isActive && !a.pausedAt),
    [agents]
  )

  // Auto-set test command from project settings
  useEffect(() => {
    if (selectedProject?.testCommand) {
      setTestCommand(selectedProject.testCommand)
    }
  }, [selectedProject])

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
    if (!selectedProject) {
      setError('Please select a project with repository settings')
      return
    }
    if (!selectedProject.repositoryPath) {
      setError('Selected project does not have a repository path configured. Please update the project settings.')
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
        repositoryPath: selectedProject.repositoryPath,
        repositoryUrl: selectedProject.repositoryUrl || undefined,
        baseBranch: selectedProject.baseBranch || 'main',
        targetBranch: targetBranch.trim() || undefined,
        runTests,
        createPullRequest,
        autoCommit,
        testCommand: testCommand.trim() || selectedProject.testCommand || undefined,
      }

      await onSubmit({
        title: title.trim(),
        description: `PRD Execution: ${title.trim()}`,
        priority,
        assignedTo: forgeAgent.id,
        assignedToType: 'agent',
        projectId: selectedProjectId,
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
    setSelectedProjectId(defaultProjectId || '')
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

          {/* Modal Container - Flexbox centering */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="w-full max-w-2xl max-h-[90vh] bg-white dark:bg-surface-800 rounded-xl shadow-xl flex flex-col overflow-hidden pointer-events-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-surface-200 dark:border-surface-700 flex-shrink-0">
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
            <form onSubmit={handleSubmit} className="flex-1 overflow-auto p-4 space-y-4">
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

              {/* Project Selection */}
              <div className="p-4 rounded-lg bg-surface-50 dark:bg-surface-900 space-y-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-surface-700 dark:text-surface-300">
                  <FolderGit2 size={16} />
                  Project & Repository
                </h3>

                {/* Project Dropdown */}
                <div>
                  <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                    Project <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Select a project...</option>
                    {projects.filter(p => p.repositoryPath).map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                  {projects.filter(p => p.repositoryPath).length === 0 && (
                    <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">
                      No projects with repository settings. Configure a project first.
                    </p>
                  )}
                </div>

                {/* Show project repo settings (read-only) */}
                {selectedProject && (
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-surface-600 dark:text-surface-400">
                      <FolderGit2 size={14} className="flex-shrink-0" />
                      <span className="font-mono truncate">{selectedProject.repositoryPath || 'Not configured'}</span>
                    </div>
                    {selectedProject.repositoryUrl && (
                      <div className="flex items-center gap-2 text-surface-600 dark:text-surface-400">
                        <GitBranch size={14} className="flex-shrink-0" />
                        <span className="font-mono truncate">{selectedProject.repositoryUrl}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-surface-600 dark:text-surface-400">
                      <GitBranch size={14} className="flex-shrink-0" />
                      <span>Base: <span className="font-mono">{selectedProject.baseBranch || 'main'}</span></span>
                    </div>
                  </div>
                )}

                {/* Target Branch (task-specific) */}
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
                  disabled={isSubmitting || !title.trim() || !prdContent.trim() || !selectedProject?.repositoryPath || !forgeAgent}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Hammer size={16} />
                  {isSubmitting ? 'Creating...' : 'Create Forge Task'}
                </button>
              </div>
            </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export default ForgeTaskModal
