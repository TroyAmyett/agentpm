// Discovery Skill Card - Displays a discovered skill from the GitHub ecosystem

import { ExternalLink, Star, GitFork, Flame, Clock, Download } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { motion } from 'framer-motion'
import type { DiscoveredSkill } from '@/types/agentpm'

interface DiscoverySkillCardProps {
  skill: DiscoveredSkill
  rank?: number
  onImport?: () => void
  isImporting?: boolean
}

export function DiscoverySkillCard({
  skill,
  rank,
  onImport,
  isImporting = false,
}: DiscoverySkillCardProps) {
  const sourceColors = {
    official: 'bg-purple-600 text-white',
    curated: 'bg-blue-600 text-white',
    community: 'bg-surface-600 text-white',
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="group relative bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl p-5 hover:border-primary-400 dark:hover:border-primary-600 hover:shadow-lg transition-all"
    >
      {/* Rank Badge */}
      {rank && (
        <span className="absolute top-4 right-4 text-3xl font-bold text-primary-500/10 font-mono">
          #{rank}
        </span>
      )}

      {/* Badges Row */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {/* Source Type Badge */}
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${sourceColors[skill.sourceType]}`}
        >
          {skill.sourceType === 'official'
            ? 'Official'
            : skill.sourceType === 'curated'
            ? 'Curated'
            : 'Community'}
        </span>

        {/* Hot Badge */}
        {skill.isHot && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-red-500 text-white flex items-center gap-1">
            <Flame size={10} />
            Hot
          </span>
        )}

        {/* Trending Badge (high score but not hot) */}
        {!skill.isHot && skill.hotnessScore > 40 && skill.isRecentlyUpdated && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 text-white">
            📈 Trending
          </span>
        )}

        {/* New Badge */}
        {skill.isNew && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 text-white">
            ✨ New
          </span>
        )}
      </div>

      {/* Title */}
      <h3 className="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-1 pr-12 truncate">
        {skill.name}
      </h3>

      {/* Owner */}
      <div className="flex items-center gap-2 mb-3">
        {skill.ownerAvatarUrl && (
          <img
            src={skill.ownerAvatarUrl}
            alt={skill.ownerLogin}
            className="w-5 h-5 rounded-full"
          />
        )}
        <span className="text-sm text-surface-500 dark:text-surface-400 font-mono">
          @{skill.ownerLogin}
        </span>
      </div>

      {/* Description */}
      <p className="text-sm text-surface-600 dark:text-surface-300 mb-4 line-clamp-2">
        {skill.aiSummary || skill.description || 'No description available'}
      </p>

      {/* Stats Row */}
      <div className="flex items-center gap-4 text-sm text-surface-500 dark:text-surface-400 mb-4">
        <span className="flex items-center gap-1.5">
          <Star className="w-4 h-4" />
          <span className="text-primary-600 dark:text-primary-400 font-medium">
            {skill.stargazersCount.toLocaleString()}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <GitFork className="w-4 h-4" />
          <span>{skill.forksCount.toLocaleString()}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <Flame className="w-4 h-4" />
          <span className="text-orange-500 font-medium">{skill.hotnessScore}</span>
        </span>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-surface-500 dark:text-surface-400">
        <span className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          Updated{' '}
          {formatDistanceToNow(new Date(skill.githubUpdatedAt), { addSuffix: true })}
        </span>
        <div className="flex items-center gap-2">
          <a
            href={skill.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 text-primary-600 dark:text-primary-400 hover:text-primary-500 transition-colors"
          >
            View <ExternalLink className="w-3.5 h-3.5" />
          </a>
          {onImport && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onImport()
              }}
              disabled={isImporting}
              className="flex items-center gap-1 px-2 py-1 bg-primary-600 hover:bg-primary-500 disabled:bg-surface-400 text-white rounded transition-colors text-xs font-medium"
            >
              {isImporting ? (
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Download className="w-3 h-3" />
              )}
              Import
            </button>
          )}
        </div>
      </div>

      {/* Topics */}
      {skill.topics && skill.topics.length > 0 && (
        <div className="mt-4 pt-4 border-t border-surface-200 dark:border-surface-700">
          <div className="flex flex-wrap gap-1.5">
            {skill.topics.slice(0, 5).map((topic) => (
              <span
                key={topic}
                className="text-xs bg-surface-100 dark:bg-surface-700 text-primary-600 dark:text-primary-400 px-2 py-0.5 rounded font-mono"
              >
                {topic}
              </span>
            ))}
            {skill.topics.length > 5 && (
              <span className="text-xs text-surface-400 px-1">
                +{skill.topics.length - 5}
              </span>
            )}
          </div>
        </div>
      )}
    </motion.div>
  )
}
