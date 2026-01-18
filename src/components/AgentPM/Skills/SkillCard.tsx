// Skill Card - Display a skill in the grid

import { FileText, Github, FileCode, ToggleLeft, ToggleRight, Building2 } from 'lucide-react'
import type { Skill } from '@/types/agentpm'

interface SkillCardProps {
  skill: Skill
  onClick: () => void
  onToggleEnabled: (enabled: boolean) => void
}

export function SkillCard({ skill, onClick, onToggleEnabled }: SkillCardProps) {
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

  return (
    <div
      className="group relative bg-white/80 dark:bg-surface-800/80 backdrop-blur-sm rounded-xl border border-surface-200 dark:border-surface-700 p-4 hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-lg transition-all cursor-pointer"
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className="p-2 rounded-lg bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400">
          <FileText size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-surface-900 dark:text-surface-100 truncate">
            {skill.name}
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

        {/* Enable/Disable Toggle */}
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
      </div>
    </div>
  )
}
