// Skill Card - Display a skill in the grid

import { FileText, Github, FileCode, ToggleLeft, ToggleRight, Building2, GitFork, Sparkles, Activity, CheckCircle, AlertCircle } from 'lucide-react'
import type { Skill } from '@/types/agentpm'
import type { SkillUsageStats } from '@/services/skills'

// Convert slug format (lowercase-with-dashes) to Title Case With Spaces
function formatSkillName(name: string): string {
  return name
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// Format relative time like "2h ago", "3d ago", etc.
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffDays > 30) return date.toLocaleDateString()
  if (diffDays > 0) return `${diffDays}d ago`
  if (diffHours > 0) return `${diffHours}h ago`
  if (diffMins > 0) return `${diffMins}m ago`
  return 'just now'
}

interface SkillCardProps {
  skill: Skill
  onClick: () => void
  onToggleEnabled: (enabled: boolean) => void
  onCustomize?: (skill: Skill) => void
  onEditWithAI?: (skill: Skill) => void
  isOfficial?: boolean
  usageStats?: SkillUsageStats
}

export function SkillCard({ skill, onClick, onToggleEnabled, onCustomize, onEditWithAI, isOfficial, usageStats }: SkillCardProps) {
  const sourceIcon = {
    github: <Github size={14} className="text-surface-400" />,
    local: <FileCode size={14} className="text-surface-400" />,
    marketplace: <Building2 size={14} className="text-surface-400" />,
  }[skill.sourceType]

  const sourceLabel = {
    github: 'GitHub',
    local: 'Local',
    marketplace: 'Marketplace',
  }[skill.sourceType]

  // Check if skill was created with AI builder (has conversation history)
  const hasBuilderHistory = skill.builderConversation && skill.builderConversation.length > 0

  return (
    <div
      className="group relative bg-white/80 dark:bg-surface-800/80 backdrop-blur-sm rounded-xl border border-surface-200 dark:border-surface-700 p-4 hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-lg transition-all cursor-pointer"
      onClick={onClick}
    >
      {/* Official Badge */}
      {isOfficial && (
        <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-gradient-to-r from-primary-500 to-purple-500 text-white text-xs font-medium rounded-full shadow-sm">
          @fun
        </div>
      )}

      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className={`p-2 rounded-lg ${isOfficial ? 'bg-gradient-to-br from-primary-100 to-purple-100 dark:from-primary-900/30 dark:to-purple-900/30 text-primary-600 dark:text-primary-400' : 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400'}`}>
          <FileText size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-surface-900 dark:text-surface-100 truncate">
            {formatSkillName(skill.name)}
          </h3>
          {skill.version && (
            <span className="text-xs text-surface-500">v{skill.version}</span>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-surface-600 dark:text-surface-400 line-clamp-2 mb-4 min-h-[40px]">
        {skill.description || 'No description provided'}
      </p>

      {/* Tags */}
      {skill.tags && skill.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {skill.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 text-xs rounded-full bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-400"
            >
              {tag}
            </span>
          ))}
          {skill.tags.length > 3 && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-surface-100 dark:bg-surface-700 text-surface-500">
              +{skill.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Usage Stats */}
      {usageStats && usageStats.totalUses > 0 && (
        <div className="flex items-center gap-3 mb-3 text-xs text-surface-500">
          <div className="flex items-center gap-1" title="Total executions">
            <Activity size={12} />
            <span>{usageStats.totalUses} uses</span>
          </div>
          {usageStats.successRate !== null && (
            <div
              className={`flex items-center gap-1 ${
                usageStats.successRate >= 90 ? 'text-green-500' :
                usageStats.successRate >= 70 ? 'text-yellow-500' : 'text-red-500'
              }`}
              title="Success rate"
            >
              {usageStats.successRate >= 90 ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
              <span>{usageStats.successRate}%</span>
            </div>
          )}
          {usageStats.lastUsedAt && (
            <div className="ml-auto text-surface-400" title="Last used">
              {formatRelativeTime(usageStats.lastUsedAt)}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-surface-100 dark:border-surface-700">
        {/* Source */}
        <div className="flex items-center gap-1.5 text-xs text-surface-500">
          {sourceIcon}
          <span>{sourceLabel}</span>
          {skill.isOrgShared && (
            <>
              <span className="mx-1">•</span>
              <Building2 size={12} />
              <span>Org</span>
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Customize button for official skills */}
          {isOfficial && onCustomize && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onCustomize(skill)
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors"
            >
              <GitFork size={12} />
              Customize
            </button>
          )}

          {/* Edit with AI button for user skills with builder history */}
          {!isOfficial && hasBuilderHistory && onEditWithAI && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onEditWithAI(skill)
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors"
            >
              <Sparkles size={12} />
              Edit
            </button>
          )}

          {/* Enable/Disable Toggle - only for non-official skills */}
          {!isOfficial && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onToggleEnabled(!skill.isEnabled)
              }}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                skill.isEnabled
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                  : 'bg-surface-100 dark:bg-surface-700 text-surface-500'
              }`}
            >
              {skill.isEnabled ? (
                <>
                  <ToggleRight size={14} />
                  Enabled
                </>
              ) : (
                <>
                  <ToggleLeft size={14} />
                  Disabled
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
