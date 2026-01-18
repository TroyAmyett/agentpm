// Skill Detail View - Full skill content and actions

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Github,
  FileCode,
  Building2,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  Trash2,
  ExternalLink,
  Clock,
  User,
  AlertTriangle,
  CheckCircle,
  Loader2,
} from 'lucide-react'
import type { Skill } from '@/types/agentpm'

interface SkillDetailViewProps {
  skill: Skill
  onBack: () => void
  onToggleEnabled: (enabled: boolean) => Promise<void>
  onCheckUpdates: () => Promise<boolean>
  onSync: () => Promise<void>
  onDelete: () => Promise<void>
}

export function SkillDetailView({
  skill,
  onBack,
  onToggleEnabled,
  onCheckUpdates,
  onSync,
  onDelete,
}: SkillDetailViewProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [isChecking, setIsChecking] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState<boolean | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const sourceIcon = {
    github: <Github size={16} className="text-surface-500" />,
    local: <FileCode size={16} className="text-surface-500" />,
    marketplace: <Building2 size={16} className="text-surface-500" />,
  }[skill.sourceType]

  const handleCheckUpdates = async () => {
    setIsChecking(true)
    try {
      const hasUpdates = await onCheckUpdates()
      setUpdateAvailable(hasUpdates)
    } finally {
      setIsChecking(false)
    }
  }

  const handleSync = async () => {
    setIsSyncing(true)
    try {
      await onSync()
      setUpdateAvailable(false)
    } finally {
      setIsSyncing(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await onDelete()
    } finally {
      setIsDeleting(false)
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="h-full flex flex-col bg-white dark:bg-surface-800"
    >
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-4 px-6 py-4 border-b border-surface-200 dark:border-surface-700">
        <button
          onClick={onBack}
          className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-500 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-surface-900 dark:text-surface-100">
            {skill.name}
          </h1>
          {skill.description && (
            <p className="text-sm text-surface-600 dark:text-surface-400">
              {skill.description}
            </p>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {/* Metadata */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {/* Source */}
          <div className="p-4 rounded-lg bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700">
            <div className="flex items-center gap-2 text-sm text-surface-500 mb-1">
              {sourceIcon}
              Source
            </div>
            <div className="font-medium text-surface-900 dark:text-surface-100">
              {skill.sourceType === 'github' ? 'GitHub' : skill.sourceType === 'local' ? 'Local' : 'Marketplace'}
            </div>
            {skill.sourceRepo && (
              <div className="text-xs text-surface-500 truncate" title={skill.sourceRepo}>
                {skill.sourceRepo}
              </div>
            )}
          </div>

          {/* Version */}
          <div className="p-4 rounded-lg bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700">
            <div className="text-sm text-surface-500 mb-1">Version</div>
            <div className="font-medium text-surface-900 dark:text-surface-100">
              v{skill.version}
            </div>
          </div>

          {/* Last Updated */}
          <div className="p-4 rounded-lg bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700">
            <div className="flex items-center gap-2 text-sm text-surface-500 mb-1">
              <Clock size={14} />
              Updated
            </div>
            <div className="font-medium text-surface-900 dark:text-surface-100">
              {formatDate(skill.updatedAt)}
            </div>
          </div>

          {/* Author */}
          <div className="p-4 rounded-lg bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700">
            <div className="flex items-center gap-2 text-sm text-surface-500 mb-1">
              <User size={14} />
              Author
            </div>
            <div className="font-medium text-surface-900 dark:text-surface-100">
              {skill.author || 'Unknown'}
            </div>
          </div>
        </div>

        {/* Tags */}
        {skill.tags && skill.tags.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-surface-700 dark:text-surface-300 mb-2">
              Tags
            </h3>
            <div className="flex flex-wrap gap-2">
              {skill.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1 text-sm rounded-full bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Source URL */}
        {skill.sourceUrl && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-surface-700 dark:text-surface-300 mb-2">
              Source URL
            </h3>
            <a
              href={skill.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400 hover:underline"
            >
              {skill.sourceUrl}
              <ExternalLink size={14} />
            </a>
          </div>
        )}

        {/* Update Status */}
        {skill.sourceType === 'github' && updateAvailable !== null && (
          <div
            className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
              updateAvailable
                ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
                : 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
            }`}
          >
            {updateAvailable ? (
              <>
                <AlertTriangle className="text-amber-600 dark:text-amber-400" size={20} />
                <span className="flex-1 text-sm text-amber-700 dark:text-amber-300">
                  An update is available from GitHub
                </span>
                <button
                  onClick={handleSync}
                  disabled={isSyncing}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {isSyncing ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                  Pull Update
                </button>
              </>
            ) : (
              <>
                <CheckCircle className="text-green-600 dark:text-green-400" size={20} />
                <span className="flex-1 text-sm text-green-700 dark:text-green-300">
                  Skill is up to date
                </span>
              </>
            )}
          </div>
        )}

        {/* Content */}
        <div>
          <h3 className="text-sm font-medium text-surface-700 dark:text-surface-300 mb-2">
            Content
          </h3>
          <div className="p-4 rounded-lg bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 overflow-auto max-h-[400px]">
            <pre className="text-sm text-surface-800 dark:text-surface-200 whitespace-pre-wrap font-mono">
              {skill.content}
            </pre>
          </div>
        </div>
      </div>

      {/* Actions Footer */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-t border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900">
        {/* Enable/Disable */}
        <button
          onClick={() => onToggleEnabled(!skill.isEnabled)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            skill.isEnabled
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50'
              : 'bg-surface-200 dark:bg-surface-700 text-surface-600 dark:text-surface-400 hover:bg-surface-300 dark:hover:bg-surface-600'
          }`}
        >
          {skill.isEnabled ? (
            <>
              <ToggleRight size={18} />
              Enabled
            </>
          ) : (
            <>
              <ToggleLeft size={18} />
              Disabled
            </>
          )}
        </button>

        <div className="flex items-center gap-2">
          {/* Check for Updates (GitHub only) */}
          {skill.sourceType === 'github' && (
            <button
              onClick={handleCheckUpdates}
              disabled={isChecking}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-100 dark:bg-surface-700 hover:bg-surface-200 dark:hover:bg-surface-600 text-surface-700 dark:text-surface-300 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {isChecking ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <RefreshCw size={16} />
              )}
              Check for Updates
            </button>
          )}

          {/* Delete */}
          {showDeleteConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-surface-600 dark:text-surface-400">
                Delete this skill?
              </span>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 rounded-lg bg-surface-200 dark:bg-surface-700 hover:bg-surface-300 dark:hover:bg-surface-600 text-surface-700 dark:text-surface-300 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 text-sm font-medium transition-colors"
            >
              <Trash2 size={16} />
              Delete
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}
