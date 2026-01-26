// Discover Tab - Shows trending/hot skills from the GitHub ecosystem

import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Search, Code2, Star, Clock, Flame, RefreshCw } from 'lucide-react'
import { DiscoverySkillCard } from './DiscoverySkillCard'
import { SkillPickerModal } from './SkillPickerModal'
import { fetchDiscoveredSkills, fetchDiscoveryStats } from '@/services/skills/discovery'
import {
  importFromRepoUrl,
  importFromGitHubFile,
  type RepoSkillFile,
} from '@/services/skills/index'
import type {
  DiscoveredSkill,
  DiscoverySortOption,
  DiscoverySourceType,
  DiscoveryStats,
  SkillCategory,
} from '@/types/agentpm'
import { SKILL_CATEGORY_INFO } from '@/types/agentpm'

interface DiscoverTabProps {
  accountId: string
  userId: string
  onImportSuccess: () => void
}

interface PickerState {
  isOpen: boolean
  repoName: string
  skillFiles: RepoSkillFile[]
  owner: string
  repo: string
  branch: string
}

export function DiscoverTab({ accountId, userId, onImportSuccess }: DiscoverTabProps) {
  const [skills, setSkills] = useState<DiscoveredSkill[]>([])
  const [stats, setStats] = useState<DiscoveryStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [importingId, setImportingId] = useState<string | null>(null)

  // Skill picker modal state
  const [pickerState, setPickerState] = useState<PickerState>({
    isOpen: false,
    repoName: '',
    skillFiles: [],
    owner: '',
    repo: '',
    branch: 'main',
  })

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<DiscoverySortOption>('hotness')
  const [sourceFilter, setSourceFilter] = useState<DiscoverySourceType | 'all'>('all')
  const [categoryFilter, setCategoryFilter] = useState<SkillCategory | 'all'>('all')

  // Last updated timestamp
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const loadSkills = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [skillsData, statsData] = await Promise.all([
        fetchDiscoveredSkills({
          search: searchQuery,
          sort: sortBy,
          sourceFilter,
          categoryFilter,
        }),
        fetchDiscoveryStats(),
      ])
      setSkills(skillsData)
      setStats(statsData)
      setLastUpdated(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skills')
    } finally {
      setIsLoading(false)
    }
  }, [searchQuery, sortBy, sourceFilter, categoryFilter])

  useEffect(() => {
    loadSkills()
  }, [loadSkills])

  const handleImport = useCallback(
    async (skill: DiscoveredSkill) => {
      setImportingId(skill.id)
      setError(null)
      try {
        const result = await importFromRepoUrl(skill.htmlUrl, accountId, userId)

        if (result.type === 'single') {
          // Single skill imported successfully
          onImportSuccess()
        } else if (result.type === 'multiple' && result.skillFiles) {
          // Multiple skill files found - show picker
          setPickerState({
            isOpen: true,
            repoName: skill.fullName,
            skillFiles: result.skillFiles,
            owner: result.owner || '',
            repo: result.repo || '',
            branch: result.branch || 'main',
          })
        } else if (result.type === 'none') {
          setError(`No skill files found in ${skill.fullName}. The repository needs a SKILL.md file or skills in a skills/ folder.`)
        }
      } catch (err) {
        console.error('Import failed:', err)
        setError(err instanceof Error ? err.message : 'Import failed')
      } finally {
        setImportingId(null)
      }
    },
    [accountId, userId, onImportSuccess]
  )

  const handlePickerImport = useCallback(
    async (file: RepoSkillFile) => {
      await importFromGitHubFile(
        file.rawUrl,
        pickerState.owner,
        pickerState.repo,
        file.path,
        pickerState.branch,
        accountId,
        userId
      )
      onImportSuccess()
    },
    [accountId, userId, pickerState, onImportSuccess]
  )

  const handlePickerClose = useCallback(() => {
    setPickerState((prev) => ({ ...prev, isOpen: false }))
  }, [])

  // Get unique categories from discovered skills
  const categoriesInResults = [...new Set(skills.map((s) => s.category).filter(Boolean))]

  return (
    <div className="h-full flex flex-col">
      {/* Stats Row */}
      {stats && (
        <div className="flex-shrink-0 px-6 py-4 bg-white dark:bg-surface-800 border-b border-surface-200 dark:border-surface-700">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-3 p-3 bg-surface-50 dark:bg-surface-900 rounded-lg">
              <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg text-primary-600 dark:text-primary-400">
                <Code2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xl font-bold text-surface-900 dark:text-surface-100">
                  {stats.total}
                </p>
                <p className="text-xs text-surface-500">Total Skills</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-surface-50 dark:bg-surface-900 rounded-lg">
              <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg text-yellow-600 dark:text-yellow-400">
                <Star className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xl font-bold text-surface-900 dark:text-surface-100">
                  {stats.totalStars.toLocaleString()}
                </p>
                <p className="text-xs text-surface-500">Combined Stars</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-surface-50 dark:bg-surface-900 rounded-lg">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg text-green-600 dark:text-green-400">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xl font-bold text-surface-900 dark:text-surface-100">
                  {stats.newThisWeek}
                </p>
                <p className="text-xs text-surface-500">New This Week</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-surface-50 dark:bg-surface-900 rounded-lg">
              <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg text-orange-600 dark:text-orange-400">
                <Flame className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xl font-bold text-surface-900 dark:text-surface-100">
                  {stats.hotCount}
                </p>
                <p className="text-xs text-surface-500">Hot Skills</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex-shrink-0 px-6 py-4 bg-white dark:bg-surface-800 border-b border-surface-200 dark:border-surface-700">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search skills by name, description, or topic..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Source Filter */}
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as DiscoverySourceType | 'all')}
            className="px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">All Sources</option>
            <option value="official">Official</option>
            <option value="curated">Curated</option>
            <option value="community">Community</option>
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as DiscoverySortOption)}
            className="px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="hotness">🔥 Hottest</option>
            <option value="stars">⭐ Most Stars</option>
            <option value="recent">🕐 Recently Updated</option>
            <option value="new">✨ Newest</option>
          </select>

          {/* Refresh */}
          <button
            onClick={loadSkills}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 disabled:bg-surface-400 text-white font-medium rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Category Filter Chips */}
        {categoriesInResults.length > 0 && (
          <div className="flex items-center gap-2 mt-4 overflow-x-auto pb-1">
            <button
              onClick={() => setCategoryFilter('all')}
              className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                categoryFilter === 'all'
                  ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                  : 'bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-600'
              }`}
            >
              All Categories
            </button>
            {(Object.keys(SKILL_CATEGORY_INFO) as SkillCategory[])
              .filter((cat) => categoriesInResults.includes(cat))
              .map((category) => {
                const count = skills.filter((s) => s.category === category).length
                return (
                  <button
                    key={category}
                    onClick={() => setCategoryFilter(category)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                      categoryFilter === category
                        ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                        : 'bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-600'
                    }`}
                  >
                    {SKILL_CATEGORY_INFO[category].label}
                    <span className="text-xs opacity-70">({count})</span>
                  </button>
                )
              })}
          </div>
        )}

        {/* Last updated */}
        {lastUpdated && (
          <p className="text-xs text-surface-500 mt-3">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </p>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {/* Error */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-sm underline hover:no-underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Loading */}
        {isLoading && skills.length === 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array(8)
              .fill(0)
              .map((_, i) => (
                <div
                  key={i}
                  className="bg-white dark:bg-surface-800 rounded-xl p-5 animate-pulse border border-surface-200 dark:border-surface-700"
                >
                  <div className="flex gap-2 mb-3">
                    <div className="h-5 w-16 bg-surface-200 dark:bg-surface-700 rounded-full" />
                    <div className="h-5 w-12 bg-surface-200 dark:bg-surface-700 rounded-full" />
                  </div>
                  <div className="h-6 w-3/4 bg-surface-200 dark:bg-surface-700 rounded mb-2" />
                  <div className="h-4 w-1/3 bg-surface-200 dark:bg-surface-700 rounded mb-4" />
                  <div className="h-12 w-full bg-surface-200 dark:bg-surface-700 rounded" />
                </div>
              ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && skills.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-surface-500">
            <Code2 size={48} className="mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">No skills found</p>
            <p className="text-sm">Try adjusting your search or filters</p>
          </div>
        )}

        {/* Skills Grid */}
        {skills.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <AnimatePresence mode="popLayout">
              {skills.map((skill, index) => (
                <DiscoverySkillCard
                  key={skill.id}
                  skill={skill}
                  rank={sortBy === 'hotness' ? index + 1 : undefined}
                  onImport={() => handleImport(skill)}
                  isImporting={importingId === skill.id}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Skill Picker Modal */}
      <SkillPickerModal
        isOpen={pickerState.isOpen}
        onClose={handlePickerClose}
        repoName={pickerState.repoName}
        skillFiles={pickerState.skillFiles}
        onImport={handlePickerImport}
      />
    </div>
  )
}
